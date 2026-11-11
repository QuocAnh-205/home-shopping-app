import { AppError } from '../common/errors';
import { NotFoundException } from '@nestjs/common';
import { CoinsService } from '../coins/coins.service';
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
    product: { findUnique: jest.fn(async () => ({ name: 'Sofa' })) },
    review: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const products = { idBySlug: jest.fn(async () => productId), invalidateCache: jest.fn() };
  const coins = { rewardReview: jest.fn(async () => 100) };
  const service = new ReviewsService(
    prisma as unknown as PrismaService,
    products as unknown as ProductsService,
    { getSignedImageUrl: jest.fn() } as unknown as StorageService,
    new MetricsService(),
    coins as unknown as CoinsService,
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
    // Đánh giá đầu tiên của sản phẩm đã mua → thưởng xu
    expect(coins.rewardReview).toHaveBeenCalledWith(userId, productId, 'Sofa');
  });

  it('does not reward coins again when an existing review is edited', async () => {
    prisma.orderItem.count.mockResolvedValue(1);
    prisma.review.findUnique.mockResolvedValueOnce({ id: 'r1' });
    tx.review.upsert.mockResolvedValue({ id: 'r1' });
    await service.upsert('sofa', userId, { rating: 4, comment: 'Sửa lại đánh giá của tôi.' });
    expect(coins.rewardReview).not.toHaveBeenCalled();
  });

  it('rejects reviews from customers who have not received the product (403 REVIEW_NOT_ALLOWED)', async () => {
    prisma.orderItem.count.mockResolvedValue(0);

    const err = await service.upsert('sofa', userId, { rating: 3, comment: 'Chưa mua nhưng đánh giá.' }).catch((e: AppError) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('REVIEW_NOT_ALLOWED');
    expect((err as AppError).getStatus()).toBe(403);
    expect(tx.review.upsert).not.toHaveBeenCalled();
    // Chỉ đơn đã giao / hoàn thành / đang trả hàng mới tính là "đã nhận hàng"
    expect(prisma.orderItem.count.mock.calls[0][0].where.order.status.in).toEqual(['DELIVERED', 'COMPLETED', 'RETURN_REQUESTED', 'RETURNED']);
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
