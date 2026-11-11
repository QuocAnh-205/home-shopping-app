import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoinTransaction, CoinTxType, NotificationType, OrderStatus, Prisma } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CoinSummary {
  balance: number;
  items: Omit<CoinTransaction, 'userId'>[];
  page: number;
  totalPages: number;
  rules: { earnPercent: number; reviewReward: number; maxUsePercent: number };
}

const short = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

/**
 * Xu thưởng (1 xu = 1₫):
 * - Cộng COIN_EARN_PERCENT% giá trị đơn khi đơn Hoàn thành; COIN_REVIEW_REWARD xu khi đánh giá lần đầu sản phẩm đã mua
 * - Dùng tối đa COIN_MAX_USE_PERCENT% số tiền đơn lúc đặt hàng; đơn hủy / trả hàng → trả lại xu đã dùng,
 *   trả hàng → thu hồi xu đã thưởng
 * An toàn đồng thời: khóa dòng users (FOR UPDATE) trước khi đổi số dư; refKey unique → mỗi sự kiện chỉ ghi 1 lần.
 */
@Injectable()
export class CoinsService implements OnModuleInit {
  private readonly logger = new Logger(CoinsService.name);
  readonly earnPercent: number;
  readonly reviewReward: number;
  readonly maxUsePercent: number;
  /** Thông báo "nhận xu" gửi sau khi transaction chuyển trạng thái commit */
  private readonly pendingNotices = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.earnPercent = Number(config.get<string>('COIN_EARN_PERCENT') ?? 1);
    this.reviewReward = Number(config.get<string>('COIN_REVIEW_REWARD') ?? 100);
    this.maxUsePercent = Number(config.get<string>('COIN_MAX_USE_PERCENT') ?? 50);
  }

  onModuleInit(): void {
    this.lifecycle.register({
      name: 'coins',
      inTx: async (tx, e) => {
        if (e.to === OrderStatus.COMPLETED) {
          const earned = Math.floor((e.totalAmount * this.earnPercent) / 100);
          if (earned > 0) {
            const row = await this.apply(tx, e.userId, CoinTxType.EARN_ORDER, earned, `earn:order:${e.orderId}`, `Thưởng đơn hàng ${short(e.orderId)} hoàn thành`, e.orderId);
            if (row) this.pendingNotices.set(e.orderId, earned);
          }
        }
        if (e.to === OrderStatus.CANCELLED || e.to === OrderStatus.RETURNED) {
          const order = await tx.order.findUniqueOrThrow({ where: { id: e.orderId }, select: { coinsUsed: true } });
          if (order.coinsUsed > 0) {
            await this.apply(tx, e.userId, CoinTxType.REFUND_ORDER, order.coinsUsed, `refund:order:${e.orderId}`, `Hoàn xu đã dùng cho đơn ${short(e.orderId)}`, e.orderId);
          }
        }
        if (e.to === OrderStatus.RETURNED) {
          const earned = await tx.coinTransaction.findUnique({ where: { refKey: `earn:order:${e.orderId}` }, select: { amount: true } });
          if (earned) {
            // Không để số dư âm: thu hồi tối đa số xu khách còn
            const user = await tx.user.findUniqueOrThrow({ where: { id: e.userId }, select: { coinBalance: true } });
            const revoke = Math.min(earned.amount, user.coinBalance);
            if (revoke > 0) await this.apply(tx, e.userId, CoinTxType.REVOKE_ORDER, -revoke, `revoke:order:${e.orderId}`, `Thu hồi xu thưởng do trả hàng đơn ${short(e.orderId)}`, e.orderId);
          }
        }
      },
      afterCommit: async (e) => {
        const earned = this.pendingNotices.get(e.orderId);
        if (earned === undefined) return;
        this.pendingNotices.delete(e.orderId);
        await this.notifications.notify(e.userId, {
          type: NotificationType.COINS,
          title: `Bạn vừa nhận ${earned.toLocaleString('vi-VN')} xu`,
          body: `Xu thưởng cho đơn ${short(e.orderId)} đã được cộng vào ví, dùng để giảm giá ở lần mua sau.`,
          link: '/account?tab=coins',
          dedupeKey: `coins:earn:${e.orderId}`,
        });
      },
    });
  }

  /** Số xu tối đa được dùng cho số tiền `amount` (trước khi trừ xu) */
  usable(balance: number, amount: number): number {
    return Math.max(0, Math.min(balance, Math.floor((amount * this.maxUsePercent) / 100)));
  }

  /**
   * Ghi 1 giao dịch xu (trong transaction của caller). Khóa dòng user → các giao dịch xu của cùng người xếp hàng;
   * refKey đã có → trả null (idempotent). Trừ quá số dư → lỗi COINS_INSUFFICIENT.
   */
  async apply(
    tx: Prisma.TransactionClient,
    userId: string,
    type: CoinTxType,
    amount: number,
    refKey: string,
    note: string,
    orderId?: string,
  ): Promise<CoinTransaction | null> {
    const [user] = await tx.$queryRaw<{ coin_balance: number }[]>`SELECT coin_balance FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tài khoản', HttpStatus.NOT_FOUND);
    if (await tx.coinTransaction.findUnique({ where: { refKey }, select: { id: true } })) return null;
    const balanceAfter = user.coin_balance + amount;
    if (balanceAfter < 0) throw new AppError(ErrorCode.COINS_INSUFFICIENT, 'Số xu trong ví không đủ, vui lòng tải lại trang thanh toán', HttpStatus.CONFLICT);
    await tx.user.update({ where: { id: userId }, data: { coinBalance: balanceAfter } });
    const row = await tx.coinTransaction.create({ data: { userId, type, amount, balanceAfter, refKey, note, orderId: orderId ?? null } });
    this.logger.log({ event: 'coins.transaction', userId, type, amount, balanceAfter, refKey });
    return row;
  }

  /** Dùng xu khi đặt hàng (gọi trong transaction tạo đơn) */
  spend(tx: Prisma.TransactionClient, userId: string, orderId: string, amount: number): Promise<CoinTransaction | null> {
    return this.apply(tx, userId, CoinTxType.SPEND_ORDER, -amount, `spend:order:${orderId}`, `Dùng xu cho đơn ${short(orderId)}`, orderId);
  }

  /** Thưởng xu cho đánh giá đầu tiên của 1 sản phẩm đã mua (gọi lại không cộng thêm) */
  async rewardReview(userId: string, productId: string, productName: string): Promise<number> {
    if (this.reviewReward <= 0) return 0;
    const row = await this.prisma.$transaction((tx) =>
      this.apply(tx, userId, CoinTxType.EARN_REVIEW, this.reviewReward, `review:${userId}:${productId}`, `Thưởng đánh giá "${productName.slice(0, 120)}"`),
    );
    if (!row) return 0;
    await this.notifications.notify(userId, {
      type: NotificationType.COINS,
      title: `Cảm ơn bạn đã đánh giá! +${this.reviewReward} xu`,
      body: `Đánh giá sản phẩm "${productName.slice(0, 80)}" đã được ghi nhận.`,
      link: '/account?tab=coins',
    });
    return this.reviewReward;
  }

  async summary(userId: string, page: number, limit = 20): Promise<CoinSummary> {
    const [user, items, total] = await this.prisma.$transaction([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } }),
      this.prisma.coinTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.coinTransaction.count({ where: { userId } }),
    ]);
    return {
      balance: user.coinBalance,
      items: items.map(({ userId: _u, ...r }) => r),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      rules: { earnPercent: this.earnPercent, reviewReward: this.reviewReward, maxUsePercent: this.maxUsePercent },
    };
  }
}
