import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AdminUsersService, toCsv } from './admin-users.service';

describe('AdminUsersService', () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
  };
  const redisClient = { set: jest.fn(), del: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new AdminUsersService(
    prisma as unknown as PrismaService,
    { client: redisClient } as unknown as RedisService,
    audit as unknown as AuditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    // detail() được gọi sau mỗi thao tác → mock để chỉ kiểm tra hành vi chính
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);
  });

  it('refuses to change own role', async () => {
    await expect(service.setRole(adminId, adminId, Role.CUSTOMER)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to lock own account', async () => {
    await expect(service.lock(adminId, adminId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps at least one active admin when demoting', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'a@x.vn', role: Role.ADMIN, lockedAt: null });
    prisma.user.count.mockResolvedValue(0);

    await expect(service.setRole(adminId, userId, Role.CUSTOMER)).rejects.toThrow('At least one active admin must remain');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('changing role revokes existing sessions and writes an audit entry', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'c@x.vn', role: Role.CUSTOMER, lockedAt: null });

    await service.setRole(adminId, userId, Role.ADMIN);

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { role: Role.ADMIN } });
    expect(redisClient.set).toHaveBeenCalledWith(`auth:pwd_changed:${userId}`, expect.any(String), 'EX', expect.any(Number));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.role', entityId: userId, actorId: adminId }));
  });

  it('locking stores the reason, revokes sessions and clears the cart', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'c@x.vn', role: Role.CUSTOMER, lockedAt: null });

    await service.lock(adminId, userId, 'Spam đơn ảo');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { lockedAt: expect.any(Date), lockedReason: 'Spam đơn ảo' } });
    expect(redisClient.set).toHaveBeenCalled();
    expect(redisClient.del).toHaveBeenCalledWith(`cart:${userId}`);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.lock' }));
  });

  it('unlocking clears the failed-login counter', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'c@x.vn', role: Role.CUSTOMER, lockedAt: new Date() });

    await service.unlock(adminId, userId);

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { lockedAt: null, lockedReason: null } });
    expect(redisClient.del).toHaveBeenCalledWith('auth:failed:c@x.vn');
  });

  it('returns 404 for unknown users', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.lock(adminId, userId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('toCsv', () => {
  it('adds a UTF-8 BOM, quotes special characters and neutralises formula injection', () => {
    const csv = toCsv([
      ['Tên', 'Ghi chú'],
      ['Nguyễn "A"', '=HYPERLINK("http://evil")'],
      ['-150000', 'a,b'],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Nguyễn ""A"""');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    // Số âm hợp lệ không bị coi là công thức
    expect(csv).toContain('-150000,"a,b"');
  });
});
