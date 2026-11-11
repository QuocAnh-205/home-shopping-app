import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActorType, OrderStatus } from '@prisma/client';
import { withJobLock } from '../common/job-lock';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OrderLifecycleService } from './order-lifecycle.service';

/**
 * Job nền của đơn hàng. Chạy được trên nhiều instance: khóa Redis (SET NX) để mỗi lượt chỉ 1 instance làm,
 * và mỗi bước chuyển trạng thái vẫn là UPDATE có điều kiện → chạy trùng cũng không xử lý 2 lần.
 * JOBS_ENABLED=false (test e2e) tắt lịch tự chạy; test gọi trực tiếp các hàm run*.
 */
@Injectable()
export class OrderJobsService {
  private readonly logger = new Logger(OrderJobsService.name);
  private readonly enabled: boolean;
  readonly autoCompleteDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly lifecycle: OrderLifecycleService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('JOBS_ENABLED') !== 'false';
    this.autoCompleteDays = Number(config.get<string>('ORDER_AUTO_COMPLETE_DAYS') ?? 3);
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledAutoComplete(): Promise<void> {
    if (this.enabled) await withJobLock(this.redis, this.logger, 'job:orders:auto-complete', 600, () => this.runAutoComplete());
  }

  /** Đơn "Đã giao" quá N ngày mà khách chưa bấm "Đã nhận hàng" → tự Hoàn thành (như Shopee) */
  async runAutoComplete(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.autoCompleteDays * 86_400_000);
    const due = await this.prisma.order.findMany({
      where: { status: OrderStatus.DELIVERED, deliveredAt: { lte: cutoff } },
      select: { id: true },
      take: 500,
    });
    let done = 0;
    for (const { id } of due) {
      try {
        await this.lifecycle.transition(id, OrderStatus.COMPLETED, { type: ActorType.SYSTEM }, {
          note: `Tự động hoàn thành sau ${this.autoCompleteDays} ngày kể từ khi giao`,
        });
        done++;
      } catch (err) {
        // Đơn vừa được khách/admin xử lý song song → bỏ qua
        this.logger.warn({ event: 'job.auto_complete.skip', orderId: id, reason: (err as Error).message });
      }
    }
    if (done) this.logger.log({ event: 'job.auto_complete', completed: done });
    return done;
  }
}
