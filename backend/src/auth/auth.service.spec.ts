import { ConflictException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService, MAX_FAILED_LOGINS } from './auth.service';

describe('AuthService', () => {
  const multi = { incr: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn() };
  const redisClient = {
    get: jest.fn(),
    ttl: jest.fn(),
    del: jest.fn(),
    set: jest.fn(),
    exists: jest.fn(),
    multi: jest.fn(() => multi),
  };
  const prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
  const jwt = new JwtService({ secret: 'unit-test-secret-unit-test-secret-1234', signOptions: { expiresIn: '1h' } });
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    { client: redisClient } as unknown as RedisService,
    new MetricsService(),
  );

  const user = {
    id: '7f0c2f4e-1b1a-4d3e-9a51-3c4f7e1d2a10',
    email: 'khach@homeshop.local',
    fullName: 'Khách Hàng',
    role: Role.CUSTOMER,
    passwordHash: bcrypt.hashSync('Correct123', 4),
  };

  beforeEach(() => jest.clearAllMocks());

  it('issues a token with a unique jti on successful login and resets the failure counter', async () => {
    redisClient.get.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(user);

    const res = await service.login({ email: user.email, password: 'Correct123' });
    const payload = jwt.decode<{ sub: string; jti: string; role: Role }>(res.accessToken);

    expect(payload.sub).toBe(user.id);
    expect(payload.role).toBe(Role.CUSTOMER);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.user).toEqual({ id: user.id, email: user.email, fullName: user.fullName, role: user.role });
    expect(redisClient.del).toHaveBeenCalledWith(AuthService.failedKey(user.email));
  });

  it('counts a failed attempt with a TTL on wrong password', async () => {
    redisClient.get.mockResolvedValue('1');
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(service.login({ email: user.email, password: 'Wrong1234' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(multi.incr).toHaveBeenCalledWith(AuthService.failedKey(user.email));
    expect(multi.expire).toHaveBeenCalledWith(AuthService.failedKey(user.email), 900);
  });

  it('returns the same error for unknown email (no user enumeration)', async () => {
    redisClient.get.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login({ email: 'nobody@x.vn', password: 'Whatever1' })).rejects.toThrow('Invalid email or password');
  });

  it('locks the account after too many failures, even with the right password', async () => {
    redisClient.get.mockResolvedValue(String(MAX_FAILED_LOGINS));
    redisClient.ttl.mockResolvedValue(600);

    const err = await service.login({ email: user.email, password: 'Correct123' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects duplicate registration', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: user.id });

    await expect(
      service.register({ email: user.email, password: 'Correct123', fullName: 'Ai Đó' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokes the token for its remaining lifetime on logout', async () => {
    const exp = Math.floor(Date.now() / 1000) + 120;

    await service.logout({ sub: user.id, email: user.email, role: user.role, jti: 'abc', exp });

    const [key, value, mode, ttl] = redisClient.set.mock.calls[0];
    expect([key, value, mode]).toEqual([AuthService.revokedKey('abc'), '1', 'EX']);
    expect(ttl).toBeGreaterThan(110);
    expect(ttl).toBeLessThanOrEqual(120);
  });
});
