import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { StorageService } from '../storage/storage.service';
import { ListReviewsQuery, UpsertReviewDto } from './reviews.dto';

const reviewSelect = {
  id: true,
  rating: true,
  comment: true,
  verifiedPurchase: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, fullName: true, avatarUrl: true } },
} satisfies Prisma.ReviewSelect;

export type ReviewView = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

export interface ReviewSummary {
  average: number;
  count: number;
  /** Số lượt theo từng mức sao: { "5": 12, "4": 3, ... } */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface ReviewPage {
  items: ReviewView[];
  summary: ReviewSummary;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface LatestReview extends ReviewView {
  product: { name: string; slug: string; imageUrl: string | null };
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly storage: StorageService,
    private readonly metrics: MetricsService,
  ) {}

  async list(slug: string, query: ListReviewsQuery): Promise<ReviewPage> {
    const productId = await this.products.idBySlug(slug);
    const where: Prisma.ReviewWhereInput = { productId, ...(query.rating ? { rating: query.rating } : {}) };
    const [items, total, summary] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: reviewSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.review.count({ where }),
      this.summary(productId),
    ]);
    return { items, summary, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async mine(slug: string, userId: string): Promise<ReviewView | null> {
    const productId = await this.products.idBySlug(slug);
    return this.prisma.review.findUnique({ where: { productId_userId: { productId, userId } }, select: reviewSelect });
  }

  /** Mỗi người 1 đánh giá cho mỗi sản phẩm: gửi lại = cập nhật đánh giá cũ */
  async upsert(slug: string, userId: string, dto: UpsertReviewDto): Promise<ReviewView> {
    const productId = await this.products.idBySlug(slug);
    const purchased = await this.prisma.orderItem.count({
      where: { productId, order: { userId, status: { not: OrderStatus.CANCELLED } } },
    });

    const review = await this.prisma.$transaction(async (tx) => {
      await ReviewsService.lockProduct(tx, productId);
      const saved = await tx.review.upsert({
        where: { productId_userId: { productId, userId } },
        create: { productId, userId, rating: dto.rating, comment: dto.comment, verifiedPurchase: purchased > 0 },
        update: { rating: dto.rating, comment: dto.comment, verifiedPurchase: purchased > 0 },
        select: reviewSelect,
      });
      await ReviewsService.recalculate(tx, productId);
      return saved;
    });

    await this.products.invalidateCache();
    this.metrics.reviewsTotal.inc({ action: 'upsert', rating: String(dto.rating) });
    this.logger.log({ event: 'review.saved', productId, userId, rating: dto.rating, verified: purchased > 0 });
    return review;
  }

  async removeMine(slug: string, userId: string): Promise<void> {
    const productId = await this.products.idBySlug(slug);
    await this.remove({ userId }, productId, `user:${userId}`);
  }

  /** Quản trị viên gỡ đánh giá vi phạm */
  async removeById(id: string, actorId: string): Promise<void> {
    const review = await this.prisma.review.findUnique({ where: { id }, select: { productId: true } });
    if (!review) throw new NotFoundException('Review not found');
    await this.remove({ id }, review.productId, `admin:${actorId}`);
  }

  /** Đánh giá tích cực mới nhất cho mục "Khách hàng nói gì" ở trang chủ */
  async latest(limit = 6): Promise<LatestReview[]> {
    const rows = await this.prisma.review.findMany({
      where: { rating: { gte: 4 } },
      select: { ...reviewSelect, product: { select: { name: true, slug: true, imageKey: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return Promise.all(
      rows.map(async ({ product, ...r }) => ({
        ...r,
        product: { name: product.name, slug: product.slug, imageUrl: await this.storage.getSignedImageUrl(product.imageKey) },
      })),
    );
  }

  async adminList(page: number, limit: number): Promise<{ items: (ReviewView & { product: { name: string; slug: string } })[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        select: { ...reviewSelect, product: { select: { name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count(),
    ]);
    return { items, total };
  }

  private async remove(filter: { id?: string; userId?: string }, productId: string, actor: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await ReviewsService.lockProduct(tx, productId);
      const deleted = await tx.review.deleteMany({ where: { productId, ...filter } });
      if (deleted.count === 0) throw new NotFoundException('Review not found');
      await ReviewsService.recalculate(tx, productId);
    });
    await this.products.invalidateCache();
    this.metrics.reviewsTotal.inc({ action: 'delete', rating: 'n/a' });
    this.logger.log({ event: 'review.deleted', productId, actor });
  }

  private async summary(productId: string): Promise<ReviewSummary> {
    const groups = await this.prisma.review.groupBy({ by: ['rating'], where: { productId }, _count: { _all: true } });
    const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as ReviewSummary['distribution'];
    let count = 0;
    let sum = 0;
    for (const g of groups) {
      distribution[String(g.rating) as keyof ReviewSummary['distribution']] = g._count._all;
      count += g._count._all;
      sum += g.rating * g._count._all;
    }
    return { average: count ? Math.round((sum / count) * 100) / 100 : 0, count, distribution };
  }

  /**
   * Khóa dòng sản phẩm (SELECT … FOR UPDATE) → các đánh giá đồng thời trên cùng sản phẩm chạy tuần tự,
   * bước tính lại điểm trung bình luôn thấy đủ dữ liệu đã commit (không bị lệch do race condition).
   */
  private static async lockProduct(tx: Prisma.TransactionClient, productId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
  }

  private static async recalculate(tx: Prisma.TransactionClient, productId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE products SET
        rating_avg = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE product_id = ${productId}::uuid), 0),
        rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ${productId}::uuid)
      WHERE id = ${productId}::uuid`;
  }
}
