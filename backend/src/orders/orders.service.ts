import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto, ListOrdersQuery } from './orders.dto';

const orderInclude = {
  items: { include: { product: { select: { name: true, slug: true } } }, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;

const adminOrderInclude = {
  ...orderInclude,
  user: { select: { id: true, email: true, fullName: true } },
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

/**
 * Vòng đời đơn hàng (state machine). Mọi chuyển trạng thái ngoài bảng này đều bị từ chối,
 * kể cả với admin → không thể "hồi sinh" đơn đã hủy hay giao lại đơn đã hoàn tất.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: [OrderStatus.PAID, OrderStatus.CANCELLED],
  PAID: [OrderStatus.SHIPPING, OrderStatus.CANCELLED],
  SHIPPING: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

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
            where: { id: { in: [...cart.keys()] } },
            select: { id: true, price: true },
            orderBy: { id: 'asc' },
          });
          if (products.length !== cart.size) throw new NotFoundException('Some products no longer exist');

          let total = new Prisma.Decimal(0);
          for (const p of products) {
            const qty = cart.get(p.id)!;
            const updated = await tx.product.updateMany({
              where: { id: p.id, stock: { gte: qty } },
              data: { stock: { decrement: qty } },
            });
            if (updated.count !== 1) throw new OutOfStockError(p.id);
            total = total.add(p.price.mul(qty));
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
            },
            include: orderInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
      );

      await Promise.all([this.cart.clear(userId), this.products.invalidateCache()]);
      this.metrics.ordersTotal.inc({ result: 'success' });
      this.logger.log({ event: 'order.created', orderId: order.id, userId, total: order.totalAmount.toFixed(2) });
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

  listMine(userId: string): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getMine(userId: string, id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findFirst({ where: { id, userId }, include: orderInclude });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Khách chỉ được tự hủy khi đơn còn PENDING (chưa thanh toán/xử lý) */
  async cancelMine(userId: string, id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findFirst({ where: { id, userId }, select: { status: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException(`Order in status ${order.status} can no longer be cancelled by customer`);
    }
    await this.transition(id, OrderStatus.PENDING, OrderStatus.CANCELLED, `customer:${userId}`);
    return this.getMine(userId, id);
  }

  async listAll(query: ListOrdersQuery): Promise<OrderPage> {
    const where: Prisma.OrderWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: adminOrderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async updateStatus(id: string, next: OrderStatus, actorId: string): Promise<AdminOrder> {
    const order = await this.prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (!ORDER_TRANSITIONS[order.status].includes(next)) {
      throw new BadRequestException(`Invalid transition ${order.status} → ${next}`);
    }
    await this.transition(id, order.status, next, `admin:${actorId}`);
    return this.prisma.order.findUniqueOrThrow({ where: { id }, include: adminOrderInclude });
  }

  /**
   * Chuyển trạng thái bằng UPDATE có điều kiện trên trạng thái cũ (optimistic concurrency):
   * 2 admin bấm cùng lúc → chỉ 1 người thắng, người còn lại nhận 409.
   * Hủy đơn → hoàn lại tồn kho trong cùng transaction.
   */
  private async transition(id: string, from: OrderStatus, to: OrderStatus, actor: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({ where: { id, status: from }, data: { status: to } });
      if (updated.count !== 1) throw new ConflictException('Order was modified concurrently, please reload');

      if (to === OrderStatus.CANCELLED) {
        const items = await tx.orderItem.findMany({ where: { orderId: id }, select: { productId: true, quantity: true }, orderBy: { productId: 'asc' } });
        for (const item of items) {
          await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
      }
    });

    if (to === OrderStatus.CANCELLED) await this.products.invalidateCache();
    this.metrics.orderStatusTransitions.inc({ from, to });
    this.logger.log({ event: 'order.status_changed', orderId: id, from, to, actor });
  }
}
