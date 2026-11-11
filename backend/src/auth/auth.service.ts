import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { MailService } from '../mail/mail.service';
import { passwordChangedMail, passwordResetMail } from '../mail/mail.templates';
import { MetricsService } from '../metrics/metrics.service';
import { readSettings, usernameFromEmail } from '../account/settings';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ChangePasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';
import { AccountProfile, AuthResponse, JwtClaims, JwtPayload, UserProfile } from './auth.types';

// Hash giả dùng để so sánh khi email không tồn tại, chống timing attack dò email
const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation', 12);
const BCRYPT_ROUNDS = 12;
export const MAX_FAILED_LOGINS = 5;
const LOCKOUT_SECONDS = 15 * 60;
export const RESET_TOKEN_MINUTES = 30;
const MAX_RESET_REQUESTS_PER_HOUR = 3;
/** Giữ mốc "đổi mật khẩu" lâu hơn tuổi thọ tối đa của access token */
const PASSWORD_CHANGED_TTL_SECONDS = 30 * 24 * 3600;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost').replace(/\/+$/, '');
  }

  static revokedKey(jti: string): string {
    return `auth:revoked:${jti}`;
  }

  static failedKey(email: string): string {
    return `auth:failed:${email}`;
  }

  static passwordChangedKey(userId: string): string {
    return `auth:pwd_changed:${userId}`;
  }

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (exists) throw new ConflictException('Email already registered');

    const user = await this.prisma.user.create({
      data: { email: dto.email, fullName: dto.fullName, passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS) },
    });
    this.metrics.authEvents.inc({ event: 'register' });
    this.logger.log({ event: 'user.registered', userId: user.id, method: 'password' });
    return this.issue(user);
  }

  /**
   * Chống brute-force theo tài khoản (bổ sung cho rate-limit theo IP ở Nginx/Throttler):
   * sai 5 lần trong 15 phút → khóa đăng nhập email đó 15 phút, kể cả khi kẻ tấn công đổi IP.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const failedKey = AuthService.failedKey(dto.email);
    const failures = Number((await this.redis.client.get(failedKey)) ?? 0);
    if (failures >= MAX_FAILED_LOGINS) {
      const ttl = await this.redis.client.ttl(failedKey);
      this.metrics.authEvents.inc({ event: 'locked' });
      this.logger.warn({ event: 'auth.locked', email: dto.email });
      throw new HttpException(
        `Too many failed attempts. Try again in ${Math.ceil(Math.max(ttl, 60) / 60)} minutes`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Tài khoản chỉ đăng nhập Google/Facebook (chưa có mật khẩu) vẫn so sánh hash giả → không lộ loại tài khoản
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !valid) {
      await this.redis.client.multi().incr(failedKey).expire(failedKey, LOCKOUT_SECONDS).exec();
      this.metrics.authEvents.inc({ event: 'login_failed' });
      this.logger.warn({ event: 'auth.login_failed', email: dto.email, attempt: failures + 1 });
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.redis.client.del(failedKey);
    this.metrics.authEvents.inc({ event: 'login_success' });
    this.logger.log({ event: 'auth.login_success', userId: user.id, method: 'password' });
    return this.issue(user);
  }

  /** Thu hồi token tới khi nó tự hết hạn: key Redis có TTL = thời gian sống còn lại của token */
  async logout(payload: JwtPayload): Promise<void> {
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await this.redis.client.set(AuthService.revokedKey(payload.jti), '1', 'EX', ttl);
    this.metrics.authEvents.inc({ event: 'logout' });
    this.logger.log({ event: 'auth.logout', userId: payload.sub });
  }

  /** Token bị thu hồi khi: đã logout (denylist jti) HOẶC được cấp trước lần đổi mật khẩu gần nhất */
  async isRevoked(payload: Pick<JwtPayload, 'jti' | 'sub' | 'iat'>): Promise<boolean> {
    const [[, revoked], [, changedAt]] = (await this.redis.client
      .multi()
      .exists(AuthService.revokedKey(payload.jti))
      .get(AuthService.passwordChangedKey(payload.sub))
      .exec()) as [[Error | null, number], [Error | null, string | null]];
    if (revoked === 1) return true;
    return changedAt !== null && payload.iat < Number(changedAt);
  }

  /**
   * Quên mật khẩu: luôn trả cùng một kết quả dù email có tồn tại hay không (chống dò tài khoản).
   * Token ngẫu nhiên 256-bit, chỉ lưu SHA-256 trong DB, hết hạn sau 30 phút, dùng 1 lần.
   */
  async forgotPassword(email: string): Promise<void> {
    const limitKey = `auth:reset_req:${email}`;
    const requests = await this.redis.client.multi().incr(limitKey).expire(limitKey, 3600, 'NX').exec();
    if (Number(requests?.[0]?.[1] ?? 0) > MAX_RESET_REQUESTS_PER_HOUR) {
      this.logger.warn({ event: 'auth.reset_throttled', email });
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true, fullName: true } });
    if (!user) {
      this.logger.log({ event: 'auth.reset_unknown_email' });
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // Chỉ link mới nhất có hiệu lực
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: AuthService.hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
        },
      }),
    ]);
    const link = `${this.appUrl}/reset-password?token=${token}`;
    await this.mail.send(passwordResetMail(user.email, user.fullName, link, RESET_TOKEN_MINUTES));
    this.metrics.authEvents.inc({ event: 'reset_requested' });
    this.logger.log({ event: 'auth.reset_requested', userId: user.id });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: AuthService.hashToken(dto.token) },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    // Đánh dấu đã dùng bằng UPDATE có điều kiện → 2 request cùng token song song chỉ 1 cái thành công
    const consumed = await this.prisma.$transaction(async (tx) => {
      const marked = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
      if (marked.count !== 1) return false;
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } });
      return true;
    });
    if (!consumed) throw new BadRequestException('Reset link is invalid or has expired');

    await this.afterPasswordChange(record.user);
    this.metrics.authEvents.inc({ event: 'reset_completed' });
    this.logger.log({ event: 'auth.reset_completed', userId: record.userId });
  }

  /** Đổi mật khẩu khi đang đăng nhập; tài khoản Google/Facebook chưa có mật khẩu được đặt mới không cần mật khẩu cũ */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.passwordHash) {
      const valid = dto.currentPassword ? await bcrypt.compare(dto.currentPassword, user.passwordHash) : false;
      if (!valid) throw new BadRequestException('Current password is incorrect');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS) },
    });
    await this.afterPasswordChange(updated);
    this.logger.log({ event: 'auth.password_changed', userId });
    // Token mới có iat ≥ mốc đổi mật khẩu → phiên hiện tại tiếp tục đăng nhập, mọi phiên cũ bị đăng xuất
    return this.issue(updated);
  }

  private async afterPasswordChange(user: Pick<User, 'id' | 'email' | 'fullName'>): Promise<void> {
    await this.redis.client
      .multi()
      .set(AuthService.passwordChangedKey(user.id), String(Math.floor(Date.now() / 1000)), 'EX', PASSWORD_CHANGED_TTL_SECONDS)
      .del(AuthService.failedKey(user.email))
      .exec();
    await this.mail.send(passwordChangedMail(user.email, user.fullName));
  }

  async profile(userId: string): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatarUrl: true,
        phone: true,
        gender: true,
        dateOfBirth: true,
        passwordHash: true,
        createdAt: true,
        username: true,
        usernameChangedAt: true,
        coinBalance: true,
        settings: true,
        oauthAccounts: { select: { provider: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, oauthAccounts, dateOfBirth, usernameChangedAt, settings, username, ...rest } = user;
    return {
      ...rest,
      username: username ?? (await this.assignUsername(userId, user.email)),
      usernameChangeable: usernameChangedAt === null,
      settings: readSettings(settings),
      dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : null,
      hasPassword: passwordHash !== null,
      providers: oauthAccounts.map((a) => a.provider),
    };
  }

  /** Tài khoản mới (đăng ký / Google / Facebook) chưa có tên đăng nhập: tạo từ email + hậu tố ngẫu nhiên */
  async assignUsername(userId: string, email: string): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const candidate = usernameFromEmail(email, randomBytes(2).toString('hex'));
      const updated = await this.prisma.user
        .updateMany({ where: { id: userId, username: null }, data: { username: candidate } })
        .catch(() => ({ count: -1 }));
      if (updated.count === 1) return candidate;
      if (updated.count === 0) {
        const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
        if (current?.username) return current.username;
      }
    }
    throw new ServiceUnavailableException('Cannot assign username');
  }

  async issue(user: Pick<User, 'id' | 'email' | 'fullName' | 'role' | 'avatarUrl'>): Promise<AuthResponse> {
    // Mọi đường cấp token (mật khẩu, Google/Facebook, đăng ký) đều đi qua đây → chặn tài khoản bị admin khóa tại 1 chỗ
    const status = await this.prisma.user.findUnique({ where: { id: user.id }, select: { lockedAt: true } });
    if (status?.lockedAt) {
      this.metrics.authEvents.inc({ event: 'blocked_locked' });
      this.logger.warn({ event: 'auth.blocked_locked', userId: user.id });
      throw new ForbiddenException('Account is locked');
    }
    const claims: JwtClaims = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(claims, { jwtid: randomUUID() });
    const { exp } = this.jwt.decode<{ exp: number }>(accessToken);
    const profile: UserProfile = { id: user.id, email: user.email, fullName: user.fullName, role: user.role, avatarUrl: user.avatarUrl };
    return { accessToken, expiresAt: new Date(exp * 1000).toISOString(), user: profile };
  }
}
