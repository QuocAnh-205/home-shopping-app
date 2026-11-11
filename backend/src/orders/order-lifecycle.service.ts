import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ActorType, OrderPaymentStatus, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { RESTOCK_STATUSES, assertTransition } from './order-state';

export interface Actor {
  type: ActorType;
  /** id người dùng (khách/admin); null với SYSTEM */
  id?: string | null;
}

export interface TransitionOptions {
  /** Ghi vào lịch sử trạng thái (và cancel_reason khi hủy) */
  note?: string;
  /** Dữ liệu cập nhật thêm vào đơn trong cùng câu UPDATE */
  data?: Prisma.OrderUpdateManyMutationInput;
  /** Chạy trong transaction có sẵn của caller → caller phải gọi runAfterCommit(event) sau khi commit */
  tx?: Prisma.TransactionClient;
}

export interface TransitionEvent {
  orderId: string;
  userId: string;
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
  paymentMethod: PaymentMethod;
  /** Trạng thái tiền SAU bước chuyển */
  paymentStatus: OrderPaymentStatus;
  totalAmount: number;
  note?: string;
}

/**
 * Module khác (voucher, thanh toán, thông báo) gắn hành vi vào bước chuyển trạng thái mà không tạo phụ thuộc vòng:
 * - inTx: chạy trong cùng transaction (vd. hoàn lượt dùng voucher khi hủy) → lỗi thì rollback cả bước chuyển
 * - afterCommit: chạy sau khi commit (vd. gọi API hoàn tiền của cổng thanh toán) → lỗi chỉ được log
 */
export interface LifecycleHook {
  name: string;
  inTx?(tx: Prisma.TransactionClient, event: TransitionEvent): Promise<void>;
  afterCommit?(event: TransitionEvent): Promise<void>;
}

const TIMESTAMP_FIELD: Partial<Record<OrderStatus, keyof Prisma.OrderUpdateManyMutationInput>> = {
  PROCESSING: 'confirmedAt',
  SHIPPING: 'shippedAt',
  DELIVERED: 'deliveredAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
};

@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);
  private readonly hooks: LifecycleHook[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly metrics: MetricsService,
  ) {}

  register(hook: LifecycleHook): void {
    this.hooks.push(hook);
  }

  /**
   * Chuyển trạng thái:
   * 1. Kiểm tra bước chuyển hợp lệ với vai của người thực hiện (order-state.ts)
   * 2. UPDATE có điều kiện trên trạng thái cũ (optimistic concurrency): 2 người bấm cùng lúc → 1 người nhận 409
   * 3. Hoàn kho khi hủy/trả hàng, ghi lịch sử, chạy hook — tất cả trong 1 transaction
   */
  async transition(orderId: string, to: OrderStatus, actor: Actor, opts: TransitionOptions = {}): Promise<TransitionEvent> {
    const run = (tx: Prisma.TransactionClient) => this.apply(tx, orderId, to, actor, opts);
    const event = opts.tx ? await run(opts.tx) : await this.prisma.$transaction(run, { timeout: 15_000 });
    if (!opts.tx) await this.runAfterCommit(event);
    return event;
  }

  async runAfterCommit(event: TransitionEvent): Promise<void> {
    if (RESTOCK_STATUSES.includes(event.to)) await this.products.invalidateCache();
    this.metrics.orderStatusTransitions.inc({ from: event.from, to: event.to });
    this.logger.log({
      event: 'order.status_changed',
      orderId: event.orderId,
      from: event.from,
      to: event.to,
      actor: event.actor.type,
      actorId: event.actor.id ?? undefined,
      paymentStatus: event.paymentStatus,
    });
    for (const hook of this.hooks) {
      if (!hook.afterCommit) continue;
      try {
        await hook.afterCommit(event);
      } catch (err) {
        this.logger.error({ event: 'order.hook_failed', hook: hook.name, orderId: event.orderId, err: (err as Error).message });
      }
    }
  }

  private async apply(
    tx: Prisma.TransactionClient,
    orderId: string,
    to: OrderStatus,
    actor: Actor,
    opts: TransitionOptions,
  ): Promise<TransitionEvent> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, userId: true, paymentMethod: true, paymentStatus: true, totalAmount: true },
    });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    assertTransition(order.status, to, actor.type);

    const now = new Date();
    const data: Prisma.OrderUpdateManyMutationInput = { status: to, ...opts.data };
    const tsField = TIMESTAMP_FIELD[to];
    if (tsField) (data as Record<string, unknown>)[tsField] = now;

    let paymentStatus = (opts.data?.paymentStatus as OrderPaymentStatus | undefined) ?? order.paymentStatus;
    if (to === OrderStatus.DELIVERED && order.paymentMethod === PaymentMethod.COD && paymentStatus === OrderPaymentStatus.UNPAID) {
      // COD: tiền được thu lúc giao hàng
      paymentStatus = OrderPaymentStatus.PAID;
      data.paymentStatus = paymentStatus;
      data.paidAt = now;
    }
    if (to === OrderStatus.CANCELLED) {
      data.cancelledBy = actor.type;
      if (opts.note) data.cancelReason = opts.note.slice(0, 255);
      data.paymentExpiresAt = null;
    }
    if (RESTOCK_STATUSES.includes(to) && paymentStatus === OrderPaymentStatus.PAID) {
      // Đã trả tiền mà hủy/trả hàng → chờ hoàn tiền (hook thanh toán gọi API refund của cổng)
      paymentStatus = OrderPaymentStatus.REFUND_PENDING;
      data.paymentStatus = paymentStatus;
    }

    const updated = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data });
    if (updated.count !== 1) {
      throw new AppError(ErrorCode.ORDER_CONCURRENT_UPDATE, 'Đơn hàng vừa được cập nhật, vui lòng tải lại', HttpStatus.CONFLICT);
    }

    if (RESTOCK_STATUSES.includes(to)) {
      // Cùng thứ tự khóa với lúc đặt hàng (theo productId) → tránh deadlock
      const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true }, orderBy: { productId: 'asc' } });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity }, soldCount: { decrement: item.quantity } },
        });
      }
    }

    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: order.status, toStatus: to, actorType: actor.type, actorId: actor.id ?? null, note: opts.note?.slice(0, 500) },
    });

    const event: TransitionEvent = {
      orderId,
      userId: order.userId,
      from: order.status,
      to,
      actor,
      paymentMethod: (opts.data?.paymentMethod as PaymentMethod | undefined) ?? order.paymentMethod,
      paymentStatus,
      totalAmount: order.totalAmount,
      note: opts.note,
    };
    for (const hook of this.hooks) if (hook.inTx) await hook.inTx(tx, event);
    return event;
  }
}
