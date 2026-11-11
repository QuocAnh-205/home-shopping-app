import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { maskName, readSettings } from '../account/settings';
import { AppError, ErrorCode } from '../common/errors';
import { CoinsService } from '../coins/coins.service';
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

/** Đơn ở các trạng thái này nghĩa là khách ĐÃ NHẬN hàng */
const REVIEWABLE_STATUSES: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED];

export type ReviewView = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

/** Đánh giá hiển thị công khai: kèm cài đặt quyền riêng tư của người viết để ẩn tên nếu họ chọn */
const publicSelect = {
  ...reviewSelect,
  user: { select: { id: true, fullName: true, avatarUrl: true, settings: true } },
} satisfies Prisma.ReviewSelect;
type PublicRow = Prisma.ReviewGetPayload<{ select: typeof publicSelect }>;

/** Người viết bật "Ẩn tên khi đánh giá" → hiện "N***h", không ảnh đại diện */
export function presentReview<T extends Omit<PublicRow, never>>(row: T): Omit<T, 'user'> & { user: ReviewView['user'] } {
  const { settings, ...user } = row.user;
  const hidden = readSettings(settings).hideNameInReviews;
  return { ...row, user: hidden ? { id: user.id, fullName: maskName(user.fullName), avatarUrl: null } : user };
}

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
    private readonly coins: CoinsService,
  ) {}

  async list(slug: string, query: ListReviewsQuery): Promise<ReviewPage> {
    const productId = await this.products.idBySlug(slug);
    const where: Prisma.ReviewWhereInput = { productId, ...(query.rating ? { rating: query.rating } : {}) };
    const [items, total, summary] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: publicSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.review.count({ where }),
      this.summary(productId),
    ]);
    return { items: items.map(presentReview), summary, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async mine(slug: string, userId: string): Promise<ReviewView | null> {
    const productId = await this.products.idBySlug(slug);
    return this.prisma.review.findUnique({ where: { productId_userId: { productId, userId } }, select: reviewSelect });
  }

  /** Đã NHẬN hàng (giao thành công) ít nhất 1 lần → mới được đánh giá, giống các sàn TMĐT */
  private received(productId: string, userId: string): Promise<number> {
    return this.prisma.orderItem.count({ where: { productId, order: { userId, status: { in: REVIEWABLE_STATUSES } } } });
  }

  async canReview(slug: string, userId: string): Promise<boolean> {
    return (await this.received(await this.products.idBySlug(slug), userId)) > 0;
  }

  /** Mỗi người 1 đánh giá cho mỗi sản phẩm: gửi lại = cập nhật đánh giá cũ. Chỉ người đã nhận hàng mới viết được */
  async upsert(slug: string, userId: string, dto: UpsertReviewDto): Promise<ReviewView> {
    const productId = await this.products.idBySlug(slug);
    const purchased = await this.received(productId, userId);
    if (purchased === 0) {
      throw new AppError(
        ErrorCode.REVIEW_NOT_ALLOWED,
        'Chỉ khách đã mua và nhận hàng mới đánh giá được sản phẩm này',
        HttpStatus.FORBIDDEN,
      );
    }

    const existed = await this.prisma.review.findUnique({ where: { productId_userId: { productId, userId } }, select: { id: true } });
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
    // Thưởng xu cho đánh giá ĐẦU TIÊN của sản phẩm đã mua (sửa/xóa rồi viết lại không cộng thêm – refKey cố định)
    if (!existed && purchased > 0) {
      const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { name: true } });
      await this.coins.rewardReview(userId, productId, product?.name ?? slug).catch((err) =>
        this.logger.error({ event: 'review.coin_reward_failed', userId, productId, err: (err as Error).message }),
      );
    }
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
      where: { rating: { gte: 4 }, product: { isActive: true } },
      select: { ...publicSelect, product: { select: { name: true, slug: true, imageKey: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return Promise.all(
      rows.map(presentReview).map(async ({ product, ...r }) => ({
        ...r,
        product: { name: product.name, slug: product.slug, imageUrl: await this.storage.getSignedImageUrl(product.imageKey) },
      })),
    );
  }

  async adminList(query: { page: number; limit: number; rating?: number; verified?: boolean; q?: string }): Promise<{
    items: (ReviewView & { product: { name: string; slug: string }; userEmail: string })[];
    total: number;
  }> {
    const where: Prisma.ReviewWhereInput = {
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.verified !== undefined ? { verifiedPurchase: query.verified } : {}),
      ...(query.q
        ? {
            OR: [
              { comment: { contains: query.q, mode: 'insensitive' } },
              { product: { name: { contains: query.q, mode: 'insensitive' } } },
              { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
              { user: { email: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        select: { ...reviewSelect, product: { select: { name: true, slug: true } }, user: { select: { ...reviewSelect.user.select, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items: rows.map(({ user: { email, ...user }, ...r }) => ({ ...r, user, userEmail: email })), total };
  }

  /** Gỡ đánh giá (admin) – trả về thông tin để ghi nhật ký */
  async removeByIdWithInfo(id: string, actorId: string): Promise<{ productName: string; author: string; rating: number }> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: { productId: true, rating: true, product: { select: { name: true } }, user: { select: { email: true } } },
    });
    if (!review) throw new NotFoundException('Review not found');
    await this.remove({ id }, review.productId, `admin:${actorId}`);
    return { productName: review.product.name, author: review.user.email, rating: review.rating };
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
