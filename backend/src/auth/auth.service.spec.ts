import { BadRequestException, ConflictException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { MailService } from '../mail/mail.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService, MAX_FAILED_LOGINS } from './auth.service';

describe('AuthService', () => {
  const multi = {
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exists: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };
  const redisClient = {
    get: jest.fn(),
    ttl: jest.fn(),
    del: jest.fn(),
    set: jest.fn(),
    exists: jest.fn(),
    multi: jest.fn(() => multi),
  };
  const tx = {
    passwordResetToken: { updateMany: jest.fn(), deleteMany: jest.fn() },
    user: { update: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    passwordResetToken: { findUnique: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const mail = { send: jest.fn() };
  const jwt = new JwtService({ secret: 'unit-test-secret-unit-test-secret-1234', signOptions: { expiresIn: '1h' } });
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    { client: redisClient } as unknown as RedisService,
    new MetricsService(),
    mail as unknown as MailService,
    new ConfigService({ APP_URL: 'https://shop.test' }),
  );

  const user = {
    id: '7f0c2f4e-1b1a-4d3e-9a51-3c4f7e1d2a10',
    email: 'khach@homeshop.local',
    fullName: 'Khách Hàng',
    role: Role.CUSTOMER,
    avatarUrl: null,
    passwordHash: bcrypt.hashSync('Correct123', 4),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    multi.exec.mockResolvedValue([[null, 1]]);
    prisma.$transaction.mockImplementation((arg: unknown) => (typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[])));
  });

  describe('login', () => {
    it('issues a token with a unique jti and resets the failure counter', async () => {
      redisClient.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(user);

      const res = await service.login({ email: user.email, password: 'Correct123' });
      const payload = jwt.decode<{ sub: string; jti: string; role: Role }>(res.accessToken);

      expect(payload.sub).toBe(user.id);
      expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.user).toEqual({ id: user.id, email: user.email, fullName: user.fullName, role: user.role, avatarUrl: null });
      expect(redisClient.del).toHaveBeenCalledWith(AuthService.failedKey(user.email));
    });

    it('counts a failed attempt with a TTL on wrong password', async () => {
      redisClient.get.mockResolvedValue('1');
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.login({ email: user.email, password: 'Wrong1234' })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(multi.incr).toHaveBeenCalledWith(AuthService.failedKey(user.email));
      expect(multi.expire).toHaveBeenCalledWith(AuthService.failedKey(user.email), 900);
    });

    it('returns the same error for unknown email and for social-only accounts', async () => {
      redisClient.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...user, passwordHash: null });

      await expect(service.login({ email: 'nobody@x.vn', password: 'Whatever1' })).rejects.toThrow('Invalid email or password');
      await expect(service.login({ email: user.email, password: 'Whatever1' })).rejects.toThrow('Invalid email or password');
    });

    it('locks the account after too many failures, even with the right password', async () => {
      redisClient.get.mockResolvedValue(String(MAX_FAILED_LOGINS));
      redisClient.ttl.mockResolvedValue(600);

      const err = await service.login({ email: user.email, password: 'Correct123' }).catch((e: unknown) => e);

      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  it('rejects duplicate registration', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: user.id });

    await expect(service.register({ email: user.email, password: 'Correct123', fullName: 'Ai Đó' })).rejects.toBeInstanceOf(ConflictException);
  });

  describe('revocation', () => {
    it('revokes the token for its remaining lifetime on logout', async () => {
      const exp = Math.floor(Date.now() / 1000) + 120;

      await service.logout({ sub: user.id, email: user.email, role: user.role, jti: 'abc', iat: exp - 3600, exp });

      const [key, value, mode, ttl] = redisClient.set.mock.calls[0];
      expect([key, value, mode]).toEqual([AuthService.revokedKey('abc'), '1', 'EX']);
      expect(ttl).toBeGreaterThan(110);
    });

    it.each([
      ['denylisted jti', 1, null, 1000, true],
      ['issued before password change', 0, '2000', 1999, true],
      ['issued after password change', 0, '2000', 2000, false],
      ['no password change', 0, null, 1000, false],
    ])('%s → revoked=%s', async (_label, exists, changedAt, iat, expected) => {
      multi.exec.mockResolvedValue([
        [null, exists],
        [null, changedAt],
      ]);
      await expect(service.isRevoked({ jti: 'x', sub: user.id, iat })).resolves.toBe(expected);
    });
  });

  describe('password reset', () => {
    it('sends a single-use link and stores only the token hash', async () => {
      multi.exec.mockResolvedValue([[null, 1]]);
      prisma.user.findUnique.mockResolvedValue(user);

      await service.forgotPassword(user.email);

      const stored = prisma.passwordResetToken.create.mock.calls[0][0].data;
      const message = mail.send.mock.calls[0][0];
      const token = /token=([A-Za-z0-9_-]+)/.exec(message.text)![1];
      expect(message.to).toBe(user.email);
      expect(message.text).toContain('https://shop.test/reset-password?token=');
      expect(stored.tokenHash).toBe(AuthService.hashToken(token));
      expect(stored.tokenHash).not.toContain(token);
      expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    });

    it('does nothing (silently) for unknown emails or when throttled', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.forgotPassword('nobody@x.vn');
      multi.exec.mockResolvedValue([[null, 4]]);
      await service.forgotPassword(user.email);

      expect(mail.send).not.toHaveBeenCalled();
    });

    it('rejects expired tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 1, userId: user.id, usedAt: null, expiresAt: new Date(Date.now() - 1000), user });

      await expect(service.resetPassword({ token: 'x'.repeat(43), password: 'NewPass123' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates the password, invalidates old sessions and notifies the user', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 1, userId: user.id, usedAt: null, expiresAt: new Date(Date.now() + 60_000), user });
      tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

      await service.resetPassword({ token: 'x'.repeat(43), password: 'NewPass123' });

      const newHash = tx.user.update.mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare('NewPass123', newHash)).toBe(true);
      expect(multi.set).toHaveBeenCalledWith(AuthService.passwordChangedKey(user.id), expect.any(String), 'EX', expect.any(Number));
      expect(mail.send.mock.calls[0][0].subject).toContain('thay đổi');
    });

    it('a token can only be consumed once (concurrent use)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 1, userId: user.id, usedAt: null, expiresAt: new Date(Date.now() + 60_000), user });
      tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.resetPassword({ token: 'x'.repeat(43), password: 'NewPass123' })).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });

  describe('change password', () => {
    it('requires the current password when one exists', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.changePassword(user.id, { currentPassword: 'Wrong1234', newPassword: 'NewPass123' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lets social-only accounts set a first password without the current one', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: null });
      prisma.user.update.mockResolvedValue(user);

      const res = await service.changePassword(user.id, { newPassword: 'NewPass123' });

      expect(res.accessToken).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });
});
