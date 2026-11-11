import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActorType, OrderStatus, RefundStatus } from '@prisma/client';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { withJobLock } from '../common/job-lock';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RefundsService } from './refunds.service';

@Injectable()
export class PaymentJobsService {
  private readonly logger = new Logger(PaymentJobsService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly refunds: RefundsService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('JOBS_ENABLED') !== 'false';
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledExpire(): Promise<void> {
    if (this.enabled) await withJobLock(this.redis, this.logger, 'job:payments:expire', 50, () => this.runExpire());
  }

  /** Lệnh hoàn còn PENDING (tiến trình chết giữa chừng) → thử lại mỗi 10 phút */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledRefundRetry(): Promise<void> {
    if (!this.enabled) return;
    await withJobLock(this.redis, this.logger, 'job:payments:refund-retry', 300, async () => {
      const stale = await this.prisma.refund.findMany({
        where: { status: RefundStatus.PENDING, updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
        select: { id: true },
        take: 50,
      });
      for (const r of stale) await this.refunds.attempt(r.id);
    });
  }

  /**
   * Đơn online quá PAYMENT_HOLD_MINUTES chưa trả tiền → tự hủy: hoàn tồn kho + trả lượt voucher (hook lifecycle),
   * đóng các link thanh toán. IPN đến muộn sau đó vẫn được ghi nhận và tự hoàn tiền (PaymentsService.late_paid).
   */
  async runExpire(now = new Date()): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: { status: OrderStatus.AWAITING_PAYMENT, paymentExpiresAt: { lte: now } },
      select: { id: true },
      take: 200,
    });
    let done = 0;
    for (const { id } of due) {
      try {
        await this.lifecycle.transition(id, OrderStatus.CANCELLED, { type: ActorType.SYSTEM }, { note: 'Quá hạn thanh toán, đơn được hủy tự động' });
        done++;
      } catch (err) {
        // IPN vừa xác nhận thanh toán song song → đơn đã sang Chờ xác nhận, bỏ qua
        this.logger.warn({ event: 'job.payment_expire.skip', orderId: id, reason: (err as Error).message });
      }
    }
    if (done) this.logger.log({ event: 'job.payment_expire', cancelled: done });
    return done;
  }
}
