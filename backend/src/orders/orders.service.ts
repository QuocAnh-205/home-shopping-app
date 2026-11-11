import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType, NotificationType, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { CoinsService } from '../coins/coins.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError, ErrorCode } from '../common/errors';
import { CartService } from '../cart/cart.service';
import { PlaceOrderDto } from '../checkout/checkout.dto';
import { CheckoutLine, CheckoutPreview, CheckoutService } from '../checkout/checkout.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { VouchersService } from '../vouchers/vouchers.service';
import type { AdminListOrdersQuery } from '../admin/admin.dto';
import { OrderLifecycleService } from './order-lifecycle.service';

const orderInclude = {
  items: { include: { product: { select: { name: true, slug: true, imageKey: true } } }, orderBy: { id: 'asc' } },
  history: {
    select: { fromStatus: true, toStatus: true, actorType: true, note: true, createdAt: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.OrderInclude;

const adminOrderInclude = {
  ...orderInclude,
  user: { select: { id: true, email: true, fullName: true, phone: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type AdminOrder = Prisma.OrderGetPayload<{ include: typeof adminOrderInclude }>;

export interface OrderPage {
  items: AdminOrder[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export { ORDER_TRANSITIONS } from './order-state';

/** Nhóm trạng thái theo tab "Đơn mua" kiểu Shopee */
export const ORDER_TABS: Readonly<Record<string, OrderStatus[]>> = {
  awaiting_payment: [OrderStatus.AWAITING_PAYMENT],
  to_ship: [OrderStatus.PENDING, OrderStatus.PROCESSING],
  shipping: [OrderStatus.SHIPPING],
  completed: [OrderStatus.DELIVERED, OrderStatus.COMPLETED],
  cancelled: [OrderStatus.CANCELLED],
  return: [OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED],
};

export interface BuyAgainResult {
  added: number;
  skipped: { productId: string; name: string; reason: string }[];
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly products: ProductsService,
    private readonly metrics: MetricsService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly checkout: CheckoutService,
    private readonly vouchers: VouchersService,
    config: ConfigService,
    private readonly coins: CoinsService,
    private readonly notifications: NotificationsService,
  ) {
    this.paymentHoldMinutes = Number(config.get<string>('PAYMENT_HOLD_MINUTES') ?? 15);
  }

  readonly paymentHoldMinutes: number;

  /**
   * Đặt hàng an toàn:
   * - Idempotency-Key: bấm 2 lần / mạng gửi lại không tạo 2 đơn (cùng key → trả lại đúng đơn đã tạo).
   * - Mọi con số tính lại ở server (CheckoutService) từ database; expectedTotal lệch → 409 PRICE_CHANGED.
   * - 1 transaction: trừ kho bằng UPDATE có điều kiện (stock >= qty AND price = giá đã tính) → không bán quá số lượng
   *   khi nhiều người đặt cùng lúc, giá đổi giữa chừng cũng bị phát hiện; tạo đơn + snapshot; trừ lượt voucher.
   * - Đơn online: Chờ thanh toán, giữ hàng PAYMENT_HOLD_MINUTES phút (job nền tự hủy nếu quá hạn).
   */
  async create(userId: string, idempotencyKey: string, dto: PlaceOrderDto): Promise<OrderWithItems> {
    const existing = await this.prisma.order.findUnique({ where: { idempotencyKey }, include: orderInclude });
    if (existing) {
      if (existing.userId !== userId) {
        throw new AppError(ErrorCode.IDEMPOTENCY_KEY_REUSED, 'Idempotency-Key đã được dùng cho yêu cầu khác', HttpStatus.CONFLICT);
      }
      return existing;
    }

    const plan = await this.checkout.build(userId, dto);
    const { preview } = plan;
    if (!preview.canPlaceOrder) {
      this.metrics.ordersTotal.inc({ result: 'failed' });
      throw OrdersService.issueError(preview);
    }
    if (dto.expectedTotal !== undefined && dto.expectedTotal !== preview.pricing.total) {
      this.metrics.ordersTotal.inc({ result: 'failed' });
      this.logger.warn({ event: 'order.failed', reason: 'price_changed', userId, expected: dto.expectedTotal, actual: preview.pricing.total });
      throw new AppError(ErrorCode.PRICE_CHANGED, 'Giá hoặc ưu đãi vừa thay đổi, vui lòng kiểm tra lại đơn hàng', HttpStatus.CONFLICT, {
        expectedTotal: dto.expectedTotal,
        total: preview.pricing.total,
        preview,
      });
    }

    const online = preview.paymentMethod !== PaymentMethod.COD;
    const status = online ? OrderStatus.AWAITING_PAYMENT : OrderStatus.PENDING;
    const a = plan.address;
    const items = [...preview.items].sort((x, y) => x.productId.localeCompare(y.productId));
    const discountVoucher = plan.appliedVouchers.find((v) => v.voucher.type !== 'FREESHIP');
    const shippingVoucher = plan.appliedVouchers.find((v) => v.voucher.type === 'FREESHIP');

    try {
      const order = await this.prisma.$transaction(
        async (tx) => {
          // Khóa dòng sản phẩm theo thứ tự id → mọi transaction cùng thứ tự, tránh deadlock
          for (const item of items) {
            const updated = await tx.product.updateMany({
              where: { id: item.productId, isActive: true, stock: { gte: item.quantity }, price: item.unitPrice },
              data: { stock: { decrement: item.quantity }, soldCount: { increment: item.quantity } },
            });
            if (updated.count !== 1) throw await OrdersService.stockOrPriceError(tx, item);
          }

          const order = await tx.order.create({
            data: {
              userId,
              idempotencyKey,
              status,
              paymentMethod: preview.paymentMethod,
              paymentExpiresAt: online ? new Date(Date.now() + this.paymentHoldMinutes * 60_000) : null,
              subtotal: preview.pricing.subtotal,
              shippingFee: preview.pricing.shippingFee,
              discountAmount: preview.pricing.discount,
              shippingDiscount: preview.pricing.shippingDiscount,
              totalAmount: preview.pricing.total,
              coinsUsed: preview.pricing.coinsUsed,
              voucherCode: discountVoucher?.voucher.code ?? null,
              shippingVoucherCode: shippingVoucher?.voucher.code ?? null,
              recipientName: a.fullName,
              phone: a.phone,
              shippingAddress: [a.street, a.ward, a.province].join(', '),
              provinceCode: a.provinceCode,
              wardCode: a.wardCode,
              latitude: a.latitude,
              longitude: a.longitude,
              shippingProvider: preview.shipping?.provider ?? null,
              estimatedDeliveryFrom: preview.shipping ? new Date(preview.shipping.estimatedDelivery.from) : null,
              estimatedDeliveryTo: preview.shipping ? new Date(preview.shipping.estimatedDelivery.to) : null,
              note: dto.note ?? null,
              items: {
                create: preview.items.map((i) => ({
                  productId: i.productId,
                  quantity: i.quantity,
                  unitPrice: i.unitPrice,
                  productName: i.name,
                  productSlug: i.slug,
                  // Snapshot ảnh lúc đặt: sản phẩm đổi ảnh / bị xóa sau này thì đơn vẫn hiện đúng món đã mua
                  imageKey: i.imageKey,
                  warrantyMonths: i.warrantyMonths ?? null,
                })),
              },
              history: {
                create: {
                  toStatus: status,
                  actorType: ActorType.CUSTOMER,
                  actorId: userId,
                  note: online ? `Đặt hàng, chờ thanh toán qua ${CheckoutService.paymentLabel(preview.paymentMethod)}` : 'Đặt hàng',
                },
              },
            },
            include: orderInclude,
          });
          await this.vouchers.reserve(tx, userId, order.id, plan.appliedVouchers);
          // Xu: trừ số dư có khóa dòng; số dư vừa bị dùng ở đơn khác → COINS_INSUFFICIENT, rollback cả đơn
          if (preview.pricing.coinsUsed > 0) await this.coins.spend(tx, userId, order.id, preview.pricing.coinsUsed);
          return order;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
      );

      // Snapshot ảnh sản phẩm (khóa ảnh gốc, không phải URL ký tạm thời)
      await this.snapshotImages(order.id);
      await Promise.all([this.cart.removeItems(userId, plan.cartProductIds), this.products.invalidateCache()]);
      this.metrics.ordersTotal.inc({ result: 'success' });
      await this.notifications.notify(userId, {
        type: NotificationType.ORDER,
        title: online ? 'Đặt hàng thành công – chờ thanh toán' : 'Đặt hàng thành công',
        body: online
          ? `Đơn #${order.id.slice(0, 8).toUpperCase()} đang được giữ hàng, vui lòng hoàn tất thanh toán ${preview.pricing.total.toLocaleString('vi-VN')}₫.`
          : `Đơn #${order.id.slice(0, 8).toUpperCase()} (${preview.pricing.total.toLocaleString('vi-VN')}₫) đang chờ cửa hàng xác nhận.`,
        link: `/orders/${order.id}`,
        dedupeKey: `order:${order.id}:created`,
      });
      this.logger.log({
        event: 'order.created',
        orderId: order.id,
        userId,
        status,
        paymentMethod: preview.paymentMethod,
        subtotal: preview.pricing.subtotal,
        shippingFee: preview.pricing.shippingFee,
        discount: preview.pricing.discount + preview.pricing.shippingDiscount,
        coinsUsed: preview.pricing.coinsUsed,
        total: preview.pricing.total,
        vouchers: plan.appliedVouchers.map((v) => v.voucher.code),
      });
      return this.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Hai request cùng Idempotency-Key chạy song song: request thua trả về đơn đã tạo
        const winner = await this.prisma.order.findUnique({ where: { idempotencyKey }, include: orderInclude });
        if (winner && winner.userId === userId) return winner;
      }
      this.metrics.ordersTotal.inc({ result: 'failed' });
      const code = err instanceof AppError ? err.code : 'error';
      this.logger.warn({ event: 'order.failed', reason: code, userId, message: (err as Error).message });
      throw err;
    }
  }

  private async snapshotImages(orderId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE order_items oi SET image_key = p.image_key FROM products p
      WHERE oi.order_id = ${orderId}::uuid AND p.id = oi.product_id`;
  }

  /** Lỗi đầu tiên của trang thanh toán → mã lỗi + HTTP status phù hợp, kèm toàn bộ preview để frontend hiển thị */
  static issueError(preview: CheckoutPreview): AppError {
    const first = preview.issues[0] ?? { code: ErrorCode.NO_ITEMS_SELECTED, message: 'Chưa chọn sản phẩm nào' };
    const conflicts: string[] = [ErrorCode.OUT_OF_STOCK, ErrorCode.PRODUCT_UNAVAILABLE, ErrorCode.VOUCHER_NOT_APPLICABLE];
    const status = conflicts.includes(first.code)
      ? HttpStatus.CONFLICT
      : HttpStatus.BAD_REQUEST;
    return new AppError(first.code as ErrorCode, first.message, status, { issues: preview.issues, preview });
  }

  /** UPDATE trừ kho không khớp dòng nào: phân biệt ngừng bán / giá đổi / hết hàng để báo đúng cho khách */
  private static async stockOrPriceError(tx: Prisma.TransactionClient, item: CheckoutLine): Promise<AppError> {
    const p = await tx.product.findUnique({ where: { id: item.productId }, select: { isActive: true, price: true, stock: true } });
    if (!p || !p.isActive) {
      return new AppError(ErrorCode.PRODUCT_UNAVAILABLE, `${item.name} đã ngừng kinh doanh`, HttpStatus.CONFLICT, { productId: item.productId });
    }
    if (p.price !== item.unitPrice) {
      return new AppError(ErrorCode.PRICE_CHANGED, `Giá của ${item.name} vừa thay đổi, vui lòng kiểm tra lại đơn hàng`, HttpStatus.CONFLICT, {
        productId: item.productId,
        oldPrice: item.unitPrice,
        newPrice: p.price,
      });
    }
    return new AppError(
      ErrorCode.OUT_OF_STOCK,
      p.stock > 0 ? `${item.name} chỉ còn ${p.stock} sản phẩm` : `${item.name} vừa hết hàng`,
      HttpStatus.CONFLICT,
      { productId: item.productId, available: p.stock, requested: item.quantity },
    );
  }

  /** Đơn của tôi; tab = nhóm trạng thái kiểu Shopee (ORDER_TABS) hoặc 1 trạng thái cụ thể */
  listMine(userId: string, filter: { tab?: string; status?: OrderStatus } = {}): Promise<OrderWithItems[]> {
    const statuses = filter.status ? [filter.status] : filter.tab ? ORDER_TABS[filter.tab] : undefined;
    return this.prisma.order.findMany({
      where: { userId, ...(statuses ? { status: { in: statuses } } : {}) },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getMine(userId: string, id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findFirst({ where: { id, userId }, include: orderInclude });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    return order;
  }

  private async assertOwner(userId: string, id: string): Promise<void> {
    const order = await this.prisma.order.findFirst({ where: { id, userId }, select: { id: true } });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
  }

  /** Khách tự hủy khi đơn còn Chờ thanh toán / Chờ xác nhận (state machine chặn các trạng thái khác) */
  async cancelMine(userId: string, id: string, reason?: string): Promise<OrderWithItems> {
    await this.assertOwner(userId, id);
    await this.lifecycle.transition(id, OrderStatus.CANCELLED, { type: ActorType.CUSTOMER, id: userId }, { note: reason || 'Khách hủy đơn' });
    return this.getMine(userId, id);
  }

  /** "Đã nhận hàng": Đang giao → Đã giao → Hoàn thành, hoặc Đã giao → Hoàn thành */
  async confirmReceived(userId: string, id: string): Promise<OrderWithItems> {
    await this.assertOwner(userId, id);
    const actor = { type: ActorType.CUSTOMER, id: userId };
    const { status } = await this.prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (status === OrderStatus.SHIPPING) await this.lifecycle.transition(id, OrderStatus.DELIVERED, actor, { note: 'Khách xác nhận đã nhận hàng' });
    await this.lifecycle.transition(id, OrderStatus.COMPLETED, actor, { note: 'Khách xác nhận đã nhận hàng' });
    return this.getMine(userId, id);
  }

  /** "Mua lại": thêm các sản phẩm của đơn cũ vào giỏ (bỏ qua sản phẩm ngừng bán / hết hàng) */
  async buyAgain(userId: string, id: string): Promise<BuyAgainResult> {
    const order = await this.getMine(userId, id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: order.items.map((i) => i.productId) } },
      select: { id: true, name: true, stock: true, isActive: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const result: BuyAgainResult = { added: 0, skipped: [] };
    for (const item of order.items) {
      const p = byId.get(item.productId);
      if (!p || !p.isActive) {
        result.skipped.push({ productId: item.productId, name: item.product.name, reason: 'Sản phẩm đã ngừng kinh doanh' });
      } else if (p.stock <= 0) {
        result.skipped.push({ productId: p.id, name: p.name, reason: 'Sản phẩm đã hết hàng' });
      } else {
        await this.cart.addQuantity(userId, p.id, Math.min(item.quantity, p.stock));
        result.added++;
      }
    }
    return result;
  }

  /** Bộ lọc dùng chung cho danh sách & xuất CSV của admin */
  private async adminWhere(query: AdminListOrdersQuery): Promise<Prisma.OrderWhereInput> {
    const and: Prisma.OrderWhereInput[] = [];
    if (query.status) and.push({ status: query.status });
    if (query.userId) and.push({ userId: query.userId });
    // Ngày theo giờ Việt Nam (UTC+7), bao gồm cả ngày kết thúc
    if (query.from) and.push({ createdAt: { gte: new Date(`${query.from}T00:00:00+07:00`) } });
    if (query.to) and.push({ createdAt: { lt: new Date(new Date(`${query.to}T00:00:00+07:00`).getTime() + 86_400_000) } });
    const q = query.q?.replace(/^#/, '').trim();
    if (q) {
      const or: Prisma.OrderWhereInput[] = [
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { fullName: { contains: q, mode: 'insensitive' } } },
        // Tên người nhận khách tự đặt trong địa chỉ giao (có thể khác tên tài khoản)
        { recipientName: { contains: q, mode: 'insensitive' } },
        { user: { username: { contains: q.toLowerCase() } } },
        { phone: { contains: q.replace(/[\s.-]/g, '') } },
        { shippingAddress: { contains: q, mode: 'insensitive' } },
      ];
      // Mã đơn rút gọn (8 ký tự đầu của UUID) hiển thị trên giao diện → tìm theo tiền tố
      if (/^[0-9a-f-]{4,36}$/i.test(q)) {
        const ids = await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM orders WHERE id::text LIKE ${q.toLowerCase() + '%'} LIMIT 100`;
        if (ids.length) or.push({ id: { in: ids.map((r) => r.id) } });
      }
      and.push({ OR: or });
    }
    return and.length ? { AND: and } : {};
  }

  async listAll(query: AdminListOrdersQuery): Promise<OrderPage & { summary: { count: number; amount: number } }> {
    const where = await this.adminWhere(query);
    const [items, total, agg] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: adminOrderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({ where, _sum: { totalAmount: true } }),
    ]);
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      summary: { count: total, amount: agg._sum.totalAmount ?? 0 },
    };
  }

  async adminDetail(id: string): Promise<AdminOrder> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: adminOrderInclude });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    return order;
  }

  /** Xuất tối đa 10.000 đơn theo bộ lọc hiện tại */
  async adminExport(query: AdminListOrdersQuery): Promise<AdminOrder[]> {
    return this.prisma.order.findMany({ where: await this.adminWhere(query), include: adminOrderInclude, orderBy: { createdAt: 'desc' }, take: 10_000 });
  }

  async updateStatus(id: string, next: OrderStatus, actorId: string, note?: string): Promise<AdminOrder> {
    await this.lifecycle.transition(id, next, { type: ActorType.ADMIN, id: actorId }, { note });
    return this.prisma.order.findUniqueOrThrow({ where: { id }, include: adminOrderInclude });
  }
}
