import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthResponse, JwtClaims, JwtPayload, UserProfile } from './auth.types';

// Hash giả dùng để so sánh khi email không tồn tại, chống timing attack dò email
const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation', 12);
const BCRYPT_ROUNDS = 12;
export const MAX_FAILED_LOGINS = 5;
const LOCKOUT_SECONDS = 15 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  static revokedKey(jti: string): string {
    return `auth:revoked:${jti}`;
  }

  static failedKey(email: string): string {
    return `auth:failed:${email}`;
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (exists) throw new ConflictException('Email already registered');

    const user = await this.prisma.user.create({
      data: { email: dto.email, fullName: dto.fullName, passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS) },
    });
    this.metrics.authEvents.inc({ event: 'register' });
    this.logger.log({ event: 'user.registered', userId: user.id });
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
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      await this.redis.client.multi().incr(failedKey).expire(failedKey, LOCKOUT_SECONDS).exec();
      this.metrics.authEvents.inc({ event: 'login_failed' });
      this.logger.warn({ event: 'auth.login_failed', email: dto.email, attempt: failures + 1 });
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.redis.client.del(failedKey);
    this.metrics.authEvents.inc({ event: 'login_success' });
    this.logger.log({ event: 'auth.login_success', userId: user.id });
    return this.issue(user);
  }

  /** Thu hồi token tới khi nó tự hết hạn: key Redis có TTL = thời gian sống còn lại của token */
  async logout(payload: JwtPayload): Promise<void> {
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await this.redis.client.set(AuthService.revokedKey(payload.jti), '1', 'EX', ttl);
    this.metrics.authEvents.inc({ event: 'logout' });
    this.logger.log({ event: 'auth.logout', userId: payload.sub });
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.client.exists(AuthService.revokedKey(jti))) === 1;
  }

  async profile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async issue(user: User): Promise<AuthResponse> {
    const claims: JwtClaims = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(claims, { jwtid: randomUUID() });
    const { exp } = this.jwt.decode<{ exp: number }>(accessToken);
    return {
      accessToken,
      expiresAt: new Date(exp * 1000).toISOString(),
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }
}
