import { NotFoundException } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { StorageService } from '../storage/storage.service';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  const productId = 'b8f3f5a2-55a1-4b8e-8f3e-0c1f2a3b4c5d';
  const userId = '7f0c2f4e-1b1a-4d3e-9a51-3c4f7e1d2a10';
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    review: { upsert: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = {
    orderItem: { count: jest.fn() },
    review: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const products = { idBySlug: jest.fn(async () => productId), invalidateCache: jest.fn() };
  const service = new ReviewsService(
    prisma as unknown as PrismaService,
    products as unknown as ProductsService,
    { getSignedImageUrl: jest.fn() } as unknown as StorageService,
    new MetricsService(),
  );

  beforeEach(() => jest.clearAllMocks());

  it('marks the review as verified when the user bought the product', async () => {
    prisma.orderItem.count.mockResolvedValue(1);
    tx.review.upsert.mockResolvedValue({ id: 'r1' });

    await service.upsert('sofa', userId, { rating: 5, comment: 'Ngồi rất êm, giao nhanh.' });

    expect(tx.review.upsert.mock.calls[0][0].create).toMatchObject({ rating: 5, verifiedPurchase: true });
    // khóa dòng sản phẩm trước, tính lại điểm sau → không lệch khi nhiều người đánh giá cùng lúc
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.review.upsert.mock.invocationCallOrder[0]);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeGreaterThan(tx.review.upsert.mock.invocationCallOrder[0]);
    expect(products.invalidateCache).toHaveBeenCalled();
  });

  it('allows anyone signed in to review (verified=false when not purchased)', async () => {
    prisma.orderItem.count.mockResolvedValue(0);
    tx.review.upsert.mockResolvedValue({ id: 'r1' });

    await service.upsert('sofa', userId, { rating: 3, comment: 'Màu hơi khác ảnh.' });

    expect(tx.review.upsert.mock.calls[0][0].update).toMatchObject({ rating: 3, verifiedPurchase: false });
  });

  it('builds a 1–5 star distribution summary', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(3);
    prisma.review.groupBy.mockResolvedValue([
      { rating: 5, _count: { _all: 2 } },
      { rating: 4, _count: { _all: 1 } },
    ]);

    const page = await service.list('sofa', { page: 1, limit: 10 });

    expect(page.summary).toEqual({ average: 4.67, count: 3, distribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 2 } });
  });

  it('returns 404 when deleting a review that does not exist', async () => {
    tx.review.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.removeMine('sofa', userId)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
