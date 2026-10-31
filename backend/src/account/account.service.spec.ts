import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AccountService, MAX_ADDRESSES } from './account.service';

describe('AccountService', () => {
  const userId = '7f0c2f4e-1b1a-4d3e-9a51-3c4f7e1d2a10';
  const tx = {
    $queryRaw: jest.fn(),
    address: { count: jest.fn(), updateMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  const prisma = {
    user: { update: jest.fn() },
    address: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const auth = { profile: jest.fn() };
  const storage = { uploadAvatar: jest.fn() };
  const service = new AccountService(
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
    storage as unknown as StorageService,
  );
  const dto = { fullName: 'Nguyễn Văn A', phone: '0901234567', province: 'Đà Nẵng', district: 'Hải Châu', ward: 'Hải Châu 1', street: '12 Bạch Đằng' };

  beforeEach(() => jest.clearAllMocks());

  describe('parseBirthDate', () => {
    it('accepts a real past date', () => {
      expect(AccountService.parseBirthDate('2002-05-20').toISOString()).toBe('2002-05-20T00:00:00.000Z');
    });

    it.each(['2002-02-30', '1899-12-31', new Date().toISOString().slice(0, 10)])('rejects %s', (value) => {
      expect(() => AccountService.parseBirthDate(value)).toThrow(BadRequestException);
    });
  });

  it('updates only the fields that were sent', async () => {
    await service.updateProfile(userId, { phone: null, gender: 'FEMALE' });

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { phone: null, gender: 'FEMALE' } });
    expect(auth.profile).toHaveBeenCalledWith(userId);
  });

  describe('addresses', () => {
    it('makes the first address the default one', async () => {
      tx.address.count.mockResolvedValue(0);

      await service.createAddress(userId, { ...dto, isDefault: false });

      expect(tx.address.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isDefault: true, userId }) }));
    });

    it('moves the default flag when a new default is added', async () => {
      tx.address.count.mockResolvedValue(2);

      await service.createAddress(userId, { ...dto, isDefault: true });

      expect(tx.address.updateMany).toHaveBeenCalledWith({ where: { userId, isDefault: true }, data: { isDefault: false } });
    });

    it(`refuses more than ${MAX_ADDRESSES} addresses`, async () => {
      tx.address.count.mockResolvedValue(MAX_ADDRESSES);

      await expect(service.createAddress(userId, dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.address.create).not.toHaveBeenCalled();
    });

    it("cannot touch another user's address", async () => {
      tx.address.findFirst.mockResolvedValue(null);

      await expect(service.updateAddress(userId, 'other-id', dto)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deleteAddress(userId, 'other-id')).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.address.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'other-id', userId } }));
    });

    it('promotes the newest remaining address when the default one is deleted', async () => {
      tx.address.findFirst.mockResolvedValueOnce({ isDefault: true }).mockResolvedValueOnce({ id: 'next' });

      await service.deleteAddress(userId, 'a1');

      expect(tx.address.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
      expect(tx.address.update).toHaveBeenCalledWith({ where: { id: 'next' }, data: { isDefault: true } });
    });
  });
});
