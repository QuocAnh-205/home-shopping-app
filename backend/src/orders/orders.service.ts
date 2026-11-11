import { BadRequestException, ConflictException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ActorType, OrderStatus, Prisma } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import { CartService } from '../cart/cart.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import type { AdminListOrdersQuery } from '../admin/admin.dto';
import { OrderLifecycleService } from './order-lifecycle.service';
import { CreateOrderDto } from './orders.dto';

const orderInclude = {
  items: { include: { product: { select: { name: true, slug: true } } }, orderBy: { id: 'asc' } },
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

class OutOfStockError extends Error {
  constructor(readonly productId: string) {
    super(`Product ${productId} is out of stock`);
  }
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
  ) {}

  /**
   * Đặt hàng an toàn:
   * - Idempotency-Key: client retry (mạng chập chờn, double-click) không tạo đơn trùng.
   * - Trừ kho bằng UPDATE có điều kiện (stock >= qty) trong transaction → không oversell khi nhiều người mua cùng lúc.
   * - Giá lấy từ DB, không tin giá từ client.
   */
  async create(userId: string, idempotencyKey: string, dto: CreateOrderDto): Promise<OrderWithItems> {
    const existing = await this.prisma.order.findUnique({ where: { idempotencyKey }, include: orderInclude });
    if (existing) {
      if (existing.userId !== userId) throw new ConflictException('Idempotency key already used');
      return existing;
    }

    const cart = await this.cart.getRaw(userId);
    if (cart.size === 0) throw new BadRequestException('Cart is empty');

    try {
      const order = await this.prisma.$transaction(
        async (tx) => {
          // Sắp xếp theo id để mọi transaction khóa row theo cùng thứ tự → tránh deadlock
          const products = await tx.product.findMany({
            where: { id: { in: [...cart.keys()] }, isActive: true },
            select: { id: true, price: true },
            orderBy: { id: 'asc' },
          });
          if (products.length !== cart.size) throw new BadRequestException('Some products in your cart are no longer available');

          let total = 0;
          for (const p of products) {
            const qty = cart.get(p.id)!;
            const updated = await tx.product.updateMany({
              where: { id: p.id, stock: { gte: qty } },
              data: { stock: { decrement: qty }, soldCount: { increment: qty } },
            });
            if (updated.count !== 1) throw new OutOfStockError(p.id);
            total += p.price * qty;
          }

          return tx.order.create({
            data: {
              userId,
              idempotencyKey,
              totalAmount: total,
              shippingAddress: dto.shippingAddress,
              phone: dto.phone,
              items: {
                create: products.map((p) => ({ productId: p.id, quantity: cart.get(p.id)!, unitPrice: p.price })),
              },
              history: { create: { toStatus: OrderStatus.PENDING, actorType: ActorType.CUSTOMER, actorId: userId, note: 'Đặt hàng' } },
            },
            include: orderInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
      );

      await Promise.all([this.cart.clear(userId), this.products.invalidateCache()]);
      this.metrics.ordersTotal.inc({ result: 'success' });
      this.logger.log({ event: 'order.created', orderId: order.id, userId, total: order.totalAmount });
      return order;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Hai request cùng Idempotency-Key chạy song song: request thua trả về đơn đã tạo
        const winner = await this.prisma.order.findUnique({ where: { idempotencyKey }, include: orderInclude });
        if (winner && winner.userId === userId) return winner;
      }
      this.metrics.ordersTotal.inc({ result: 'failed' });
      if (err instanceof OutOfStockError) {
        this.logger.warn({ event: 'order.failed', reason: 'out_of_stock', productId: err.productId, userId });
        throw new ConflictException(err.message);
      }
      this.logger.error({ event: 'order.failed', reason: (err as Error).message, userId });
      throw err;
    }
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
