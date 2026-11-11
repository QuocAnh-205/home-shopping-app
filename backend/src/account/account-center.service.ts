import { createHash, randomInt } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import { AccountProfile } from '../auth/auth.types';
import { AppError, ErrorCode } from '../common/errors';
import { MailService } from '../mail/mail.service';
import { emailChangeCodeMail } from '../mail/mail.templates';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DEFAULT_SETTINGS, USERNAME_RE, UserSettings, readSettings } from './settings';

const EMAIL_CODE_TTL_MIN = 10;

/** Bỏ cột user_id (thừa) khỏi bản xuất dữ liệu */
const stripUser = <T extends { userId: string }>(rows: T[]): Omit<T, 'userId'>[] => rows.map(({ userId: _u, ...r }) => r);
const EMAIL_CODE_MAX_ATTEMPTS = 5;

interface PendingEmailChange {
  email: string;
  codeHash: string;
  attempts: number;
}

/**
 * Các chức năng "Tài khoản của tôi" ngoài hồ sơ cơ bản: tên đăng nhập (đổi 1 lần), đổi email bằng mã xác nhận,
 * cài đặt thông báo / quyền riêng tư, tải dữ liệu cá nhân.
 */
@Injectable()
export class AccountCenterService {
  private readonly logger = new Logger(AccountCenterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
  ) {}

  /** Tên đăng nhập chỉ được đổi MỘT lần (giống Shopee); kiểm tra trùng không phân biệt hoa thường */
  async changeUsername(userId: string, username: string): Promise<AccountProfile> {
    if (!USERNAME_RE.test(username)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Tên đăng nhập gồm 4–30 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới');
    }
    const taken = await this.prisma.user.findFirst({ where: { username, NOT: { id: userId } }, select: { id: true } });
    if (taken) throw new AppError(ErrorCode.CONFLICT, 'Tên đăng nhập đã có người dùng', HttpStatus.CONFLICT);
    try {
      const updated = await this.prisma.user.updateMany({
        where: { id: userId, usernameChangedAt: null },
        data: { username, usernameChangedAt: new Date() },
      });
      if (updated.count !== 1) throw new AppError(ErrorCode.CONFLICT, 'Tên đăng nhập chỉ được thay đổi một lần', HttpStatus.CONFLICT);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(ErrorCode.CONFLICT, 'Tên đăng nhập đã có người dùng', HttpStatus.CONFLICT);
      }
      throw err;
    }
    this.logger.log({ event: 'account.username_changed', userId });
    return this.auth.profile(userId);
  }

  static codeKey(userId: string): string {
    return `account:email-change:${userId}`;
  }

  private static hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /**
   * Bước 1 đổi email: xác minh mật khẩu hiện tại (tài khoản có mật khẩu), gửi mã 6 số tới EMAIL MỚI
   * (chứng minh khách sở hữu email đó). Mã lưu dạng băm trong Redis, hết hạn sau 10 phút.
   */
  async requestEmailChange(userId: string, newEmail: string, password?: string): Promise<{ sentTo: string; expiresInMinutes: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true, passwordHash: true } });
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tài khoản', HttpStatus.NOT_FOUND);
    if (user.passwordHash && !(password && (await bcrypt.compare(password, user.passwordHash)))) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Mật khẩu hiện tại không đúng', HttpStatus.FORBIDDEN);
    }
    if (newEmail === user.email) throw new AppError(ErrorCode.BAD_REQUEST, 'Email mới trùng với email hiện tại');
    if (await this.prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } })) {
      throw new AppError(ErrorCode.CONFLICT, 'Email này đã được dùng cho tài khoản khác', HttpStatus.CONFLICT);
    }
    if (!this.mail.enabled) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Hệ thống chưa cấu hình gửi email, chưa thể đổi email lúc này', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const pending: PendingEmailChange = { email: newEmail, codeHash: AccountCenterService.hash(code), attempts: 0 };
    await this.redis.client.set(AccountCenterService.codeKey(userId), JSON.stringify(pending), 'EX', EMAIL_CODE_TTL_MIN * 60);
    await this.mail.send(emailChangeCodeMail(newEmail, user.fullName, code, EMAIL_CODE_TTL_MIN));
    this.logger.log({ event: 'account.email_change_requested', userId });
    return { sentTo: newEmail, expiresInMinutes: EMAIL_CODE_TTL_MIN };
  }

  /** Bước 2: nhập đúng mã → đổi email (tối đa 5 lần sai, sau đó phải gửi lại mã) */
  async confirmEmailChange(userId: string, code: string): Promise<AccountProfile> {
    const key = AccountCenterService.codeKey(userId);
    const raw = await this.redis.client.get(key);
    if (!raw) throw new AppError(ErrorCode.BAD_REQUEST, 'Mã xác nhận đã hết hạn, vui lòng gửi lại mã');
    const pending = JSON.parse(raw) as PendingEmailChange;
    if (pending.codeHash !== AccountCenterService.hash(code)) {
      pending.attempts++;
      if (pending.attempts >= EMAIL_CODE_MAX_ATTEMPTS) await this.redis.client.del(key);
      else await this.redis.client.set(key, JSON.stringify(pending), 'KEEPTTL');
      throw new AppError(ErrorCode.BAD_REQUEST, pending.attempts >= EMAIL_CODE_MAX_ATTEMPTS ? 'Nhập sai quá nhiều lần, vui lòng gửi lại mã' : 'Mã xác nhận không đúng');
    }
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { email: pending.email } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(ErrorCode.CONFLICT, 'Email này đã được dùng cho tài khoản khác', HttpStatus.CONFLICT);
      }
      throw err;
    }
    await this.redis.client.del(key);
    this.logger.log({ event: 'account.email_changed', userId });
    return this.auth.profile(userId);
  }

  async updateSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { settings: true } });
    // Chỉ lấy khóa thật sự được gửi lên (DTO có thể mang thuộc tính undefined)
    const changes = Object.fromEntries(Object.entries(patch).filter(([k, v]) => typeof v === 'boolean' && k in DEFAULT_SETTINGS));
    const next = { ...readSettings(user.settings), ...changes } as UserSettings;
    await this.prisma.user.update({ where: { id: userId }, data: { settings: next as unknown as Prisma.InputJsonValue } });
    this.logger.log({ event: 'account.settings_updated', userId, keys: Object.keys(patch) });
    return next;
  }

  /** "Tải dữ liệu của tôi": mọi dữ liệu cá nhân dạng JSON (quyền truy cập dữ liệu theo Nghị định 13/2023) */
  async exportData(userId: string) {
    const [profile, addresses, banks, orders, reviews, coins, notifications] = await Promise.all([
      this.auth.profile(userId),
      this.prisma.address.findMany({ where: { userId } }).then(stripUser),
      this.prisma.bankAccount.findMany({ where: { userId } }).then(stripUser),
      this.prisma.order.findMany({
        where: { userId },
        include: { items: { select: { productName: true, quantity: true, unitPrice: true } }, history: { select: { toStatus: true, note: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.findMany({ where: { userId }, select: { rating: true, comment: true, createdAt: true, product: { select: { name: true } } } }),
      this.prisma.coinTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }).then(stripUser),
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500 }).then(stripUser),
    ]);
    this.logger.log({ event: 'account.data_exported', userId });
    return { exportedAt: new Date().toISOString(), profile, addresses, bankAccounts: banks, orders, reviews, coinTransactions: coins, notifications };
  }

  static defaults(): UserSettings {
    return { ...DEFAULT_SETTINGS };
  }
}
