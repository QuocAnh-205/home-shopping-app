import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { CartService } from './cart.service';

describe('CartService', () => {
  const multi = { hset: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn() };
  const redisClient = {
    hgetall: jest.fn(),
    hexists: jest.fn(),
    hlen: jest.fn(),
    hdel: jest.fn(),
    del: jest.fn(),
    multi: jest.fn(() => multi),
  };
  const prisma = { product: { findMany: jest.fn(), findUnique: jest.fn() } };
  const service = new CartService(
    { client: redisClient } as unknown as RedisService,
    prisma as unknown as PrismaService,
    { getSignedImageUrl: jest.fn(async (k: string | null) => k) } as unknown as StorageService,
  );
  const userId = '7f0c2f4e-1b1a-4d3e-9a51-3c4f7e1d2a10';
  const productId = 'b8f3f5a2-55a1-4b8e-8f3e-0c1f2a3b4c5d';

  beforeEach(() => jest.clearAllMocks());

  it('computes totals with decimal precision', async () => {
    redisClient.hgetall.mockResolvedValue({ [productId]: '3' });
    prisma.product.findMany.mockResolvedValue([
      { id: productId, name: 'Nồi chiên', slug: 'noi-chien', price: new Prisma.Decimal('1890000.10'), stock: 10, imageKey: '/images/products/noi-chien.webp' },
    ]);

    const cart = await service.get(userId);

    expect(cart.totalItems).toBe(3);
    expect(cart.totalAmount).toBe('5670000.30');
    expect(cart.items[0].available).toBe(true);
    expect(cart.items[0].imageUrl).toBe('/images/products/noi-chien.webp');
  });

  it('returns an empty cart without querying the database', async () => {
    redisClient.hgetall.mockResolvedValue({});

    const cart = await service.get(userId);

    expect(cart).toEqual({ items: [], totalItems: 0, totalAmount: '0.00' });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('rejects quantity above available stock', async () => {
    prisma.product.findUnique.mockResolvedValue({ stock: 2 });

    await expect(service.upsertItem(userId, productId, 5)).rejects.toBeInstanceOf(BadRequestException);
    expect(redisClient.multi).not.toHaveBeenCalled();
  });

  it('rejects unknown products', async () => {
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(service.upsertItem(userId, productId, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores item with sliding TTL', async () => {
    prisma.product.findUnique.mockResolvedValue({ stock: 10 });
    redisClient.hexists.mockResolvedValue(0);
    redisClient.hlen.mockResolvedValue(0);
    redisClient.hgetall.mockResolvedValue({});

    await service.upsertItem(userId, productId, 2);

    expect(multi.hset).toHaveBeenCalledWith(`cart:${userId}`, productId, 2);
    expect(multi.expire).toHaveBeenCalledWith(`cart:${userId}`, 7 * 24 * 3600);
  });
});
