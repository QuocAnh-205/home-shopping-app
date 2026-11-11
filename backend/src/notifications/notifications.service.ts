import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ActorType, Notification, NotificationType, OrderStatus, Prisma } from '@prisma/client';
import { readSettings } from '../account/settings';
import { withJobLock } from '../common/job-lock';
import { MailService } from '../mail/mail.service';
import { notificationMail } from '../mail/mail.templates';
import { OrderLifecycleService, TransitionEvent } from '../orders/order-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  /** Đường dẫn trong web, vd. /orders/<id> */
  link?: string | null;
  /** Khóa chống gửi trùng (cùng khóa → bỏ qua) */
  dedupeKey?: string;
}

export interface NotificationPage {
  items: Notification[];
  page: number;
  totalPages: number;
  unread: number;
}

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}₫`;
const short = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

/** Nội dung thông báo cho từng bước chuyển trạng thái đơn (null = không báo) */
export function orderMessage(e: TransitionEvent): { type: NotificationType; title: string; body: string } | null {
  const code = short(e.orderId);
  switch (e.to) {
    case OrderStatus.PENDING:
      return e.from === OrderStatus.AWAITING_PAYMENT && e.actor.type !== ActorType.CUSTOMER
        ? { type: NotificationType.PAYMENT, title: 'Thanh toán thành công', body: `Đơn ${code} đã được thanh toán ${vnd(e.totalAmount)} và đang chờ cửa hàng xác nhận.` }
        : null;
    case OrderStatus.PROCESSING:
      return { type: NotificationType.ORDER, title: 'Đơn hàng đã được xác nhận', body: `Cửa hàng đang chuẩn bị đơn ${code} của bạn.` };
    case OrderStatus.SHIPPING:
      return { type: NotificationType.ORDER, title: 'Đơn hàng đang được giao', body: `Đơn ${code} đã giao cho đơn vị vận chuyển, bạn để ý điện thoại nhé.` };
    case OrderStatus.DELIVERED:
      return {
        type: NotificationType.ORDER,
        title: 'Giao hàng thành công',
        body: `Đơn ${code} đã giao tới bạn. Bấm "Đã nhận hàng" nếu hài lòng, hoặc yêu cầu trả hàng/hoàn tiền trong 15 ngày.`,
      };
    case OrderStatus.COMPLETED:
      return e.from === OrderStatus.RETURN_REQUESTED
        ? { type: NotificationType.ORDER, title: 'Yêu cầu trả hàng bị từ chối', body: `Đơn ${code}: ${e.note ?? 'cửa hàng từ chối yêu cầu trả hàng'}.` }
        : { type: NotificationType.ORDER, title: 'Đơn hàng hoàn thành', body: `Cảm ơn bạn đã mua sắm! Hãy đánh giá sản phẩm trong đơn ${code} để nhận thêm xu.` };
    case OrderStatus.CANCELLED:
      return {
        type: NotificationType.ORDER,
        title: 'Đơn hàng đã hủy',
        body: `Đơn ${code} đã hủy${e.note ? `: ${e.note}` : ''}.${e.paymentStatus === 'REFUND_PENDING' ? ' Tiền đã thanh toán sẽ được hoàn lại.' : ''}`,
      };
    case OrderStatus.RETURN_REQUESTED:
      return { type: NotificationType.ORDER, title: 'Đã gửi yêu cầu trả hàng', body: `Cửa hàng sẽ xem xét yêu cầu trả hàng/hoàn tiền cho đơn ${code} trong thời gian sớm nhất.` };
    case OrderStatus.RETURNED:
      return { type: NotificationType.ORDER, title: 'Yêu cầu trả hàng được chấp nhận', body: `Đơn ${code} được chấp nhận trả hàng, tiền sẽ được hoàn ${vnd(e.totalAmount)}.` };
    default:
      return null;
  }
}

/**
 * Thông báo trong web (chuông) + email theo cài đặt của khách.
 * Lỗi gửi thông báo không bao giờ làm hỏng nghiệp vụ chính (đặt hàng, thanh toán…): chỉ ghi log.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;
  private readonly jobsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost').replace(/\/+$/, '');
    this.jobsEnabled = config.get<string>('JOBS_ENABLED') !== 'false';
  }

  onModuleInit(): void {
    this.lifecycle.register({
      name: 'notifications',
      afterCommit: async (e) => {
        const msg = orderMessage(e);
        if (msg) await this.notify(e.userId, { ...msg, link: `/orders/${e.orderId}`, dedupeKey: `order:${e.orderId}:${e.from}>${e.to}` });
      },
    });
  }

  /** Tạo thông báo (+ email nếu khách bật). Trả về null nếu bị tắt hoặc trùng dedupeKey */
  async notify(userId: string, input: NotifyInput): Promise<Notification | null> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true, settings: true } });
      if (!user || user.email.endsWith('@deleted.invalid')) return null;
      const s = readSettings(user.settings);
      const promo = input.type === NotificationType.PROMOTION;
      if (promo && !s.inAppPromotions && !s.emailPromotions) return null;

      let created: Notification | null = null;
      if (!promo || s.inAppPromotions) {
        try {
          created = await this.prisma.notification.create({
            data: { userId, type: input.type, title: input.title, body: input.body, link: input.link ?? null, dedupeKey: input.dedupeKey ?? null },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // đã báo rồi
          throw err;
        }
      }
      const wantsEmail = promo ? s.emailPromotions : s.emailOrderUpdates && input.type !== NotificationType.ACCOUNT;
      if (wantsEmail && this.mail.enabled) {
        await this.mail.send(notificationMail(user.email, user.fullName, input.title, input.body, input.link ? `${this.appUrl}${input.link}` : null));
      }
      this.logger.log({ event: 'notification.created', userId, type: input.type, title: input.title, email: wantsEmail && this.mail.enabled });
      return created;
    } catch (err) {
      this.logger.error({ event: 'notification.failed', userId, err: (err as Error).message });
      return null;
    }
  }

  async list(userId: string, type: NotificationType | undefined, page: number, limit = 20): Promise<NotificationPage> {
    const where: Prisma.NotificationWhereInput = { userId, ...(type ? { type } : {}) };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, page, totalPages: Math.max(1, Math.ceil(total / limit)), unread };
  }

  /** Số chưa đọc theo từng loại (badge trên chuông + menu) */
  async unreadCounts(userId: string): Promise<{ total: number } & Partial<Record<NotificationType, number>>> {
    const rows = await this.prisma.notification.groupBy({ by: ['type'], where: { userId, readAt: null }, _count: { _all: true } });
    const out: { total: number } & Partial<Record<NotificationType, number>> = { total: 0 };
    for (const r of rows) {
      out[r.type] = r._count._all;
      out.total += r._count._all;
    }
    return out;
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string, type?: NotificationType): Promise<number> {
    const r = await this.prisma.notification.updateMany({ where: { userId, readAt: null, ...(type ? { type } : {}) }, data: { readAt: new Date() } });
    return r.count;
  }

  /** 9:00 sáng mỗi ngày (giờ VN): nhắc voucher đã lưu sắp hết hạn trong 24 giờ mà chưa dùng */
  @Cron('0 2 * * *')
  async scheduledVoucherReminders(): Promise<void> {
    if (this.jobsEnabled) await withJobLock(this.redis, this.logger, 'job:notify:voucher-expiring', 600, () => this.runVoucherReminders());
  }

  async runVoucherReminders(now = new Date()): Promise<number> {
    const soon = new Date(now.getTime() + 24 * 3600_000);
    const saved = await this.prisma.userVoucher.findMany({
      where: { voucher: { isActive: true, endsAt: { gt: now, lte: soon } } },
      select: { userId: true, voucher: { select: { id: true, code: true, name: true, endsAt: true, perUserLimit: true } } },
      take: 2000,
    });
    let sent = 0;
    for (const { userId, voucher } of saved) {
      const used = await this.prisma.voucherUsage.count({ where: { voucherId: voucher.id, userId } });
      if (used >= voucher.perUserLimit) continue;
      const n = await this.notify(userId, {
        type: NotificationType.PROMOTION,
        title: 'Voucher sắp hết hạn',
        body: `Voucher ${voucher.code} (${voucher.name}) trong ví của bạn hết hạn lúc ${voucher.endsAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}. Dùng ngay kẻo lỡ!`,
        link: '/account?tab=vouchers',
        dedupeKey: `voucher-exp:${voucher.id}:${userId}`,
      });
      if (n) sent++;
    }
    if (sent) this.logger.log({ event: 'job.voucher_reminders', sent });
    return sent;
  }
}
