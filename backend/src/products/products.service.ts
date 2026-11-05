import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import type { AdminProductSort, ListAdminProductsQuery } from '../admin/admin.dto';
import { CreateProductDto, ListProductsQuery, ProductSort, UpdateProductDto } from './products.dto';

const productInclude = { category: { select: { id: true, name: true, slug: true } } } satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export type ProductView = Omit<ProductRow, 'imageKey' | 'price' | 'compareAtPrice' | 'ratingAvg'> & {
  price: string;
  compareAtPrice: string | null;
  /** % giảm làm tròn, 0 nếu không khuyến mãi */
  discountPercent: number;
  ratingAvg: number;
  imageUrl: string | null;
};

export interface ProductPage {
  items: ProductView[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const CACHE_PREFIX = 'cache:products';

const ORDER_BY: Record<ProductSort, Prisma.ProductOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'asc' }],
  name: [{ name: 'asc' }, { id: 'asc' }],
  best_selling: [{ soldCount: 'desc' }, { id: 'asc' }],
  top_rated: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
};

const ADMIN_ORDER_BY: Record<AdminProductSort, Prisma.ProductOrderByWithRelationInput[]> = {
  name: [{ name: 'asc' }, { id: 'asc' }],
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'asc' }],
  stock_asc: [{ stock: 'asc' }, { name: 'asc' }],
  best_selling: [{ soldCount: 'desc' }, { id: 'asc' }],
  top_rated: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
};

export interface StoreSummary {
  products: number;
  onSale: number;
  sold: number;
  reviews: number;
  averageRating: number;
  reviewers: number;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  async list(query: ListProductsQuery): Promise<ProductPage> {
    const q = query.q?.toLowerCase() || undefined;
    const key = [
      CACHE_PREFIX,
      'list',
      query.category ?? 'all',
      q ? encodeURIComponent(q) : '-',
      query.onSale ? 'sale' : '-',
      query.minPrice ?? '-',
      query.maxPrice ?? '-',
      query.sort,
      query.page,
      query.limit,
    ].join(':');
    const cached = await this.redis.getJson<ProductPage>(key);
    if (cached) return cached;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      ...(query.onSale ? { compareAtPrice: { not: null } } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? { price: { ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}), ...(query.maxPrice !== undefined ? { lt: query.maxPrice } : {}) } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: ORDER_BY[query.sort],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const result: ProductPage = {
      items: await this.toViews(rows),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
    // Kết quả tìm kiếm có độ đa dạng key cao → TTL ngắn hơn để không phình Redis
    await this.redis.setJson(key, result, q ? 30 : 60);
    return result;
  }

  /** Số liệu công khai cho trang chủ (tổng sản phẩm, đang giảm giá, đánh giá, đã bán) – cache 5 phút */
  async summary(): Promise<StoreSummary> {
    return this.cached(`${CACHE_PREFIX}:summary`, 300, async () => {
      const [row] = await this.prisma.$queryRaw<
        { products: number; on_sale: number; sold: number; reviews: number; rating: string | null; customers: number }[]
      >`
        SELECT
          (SELECT COUNT(*)::int FROM products WHERE is_active) AS products,
          (SELECT COUNT(*)::int FROM products WHERE is_active AND compare_at_price IS NOT NULL) AS on_sale,
          (SELECT COALESCE(SUM(sold_count), 0)::int FROM products) AS sold,
          (SELECT COUNT(*)::int FROM reviews) AS reviews,
          (SELECT ROUND(AVG(rating)::numeric, 2)::text FROM reviews) AS rating,
          (SELECT COUNT(DISTINCT user_id)::int FROM reviews) AS customers`;
      return {
        products: row.products,
        onSale: row.on_sale,
        sold: row.sold,
        reviews: row.reviews,
        averageRating: row.rating ? Number(row.rating) : 0,
        reviewers: row.customers,
      };
    });
  }

  /** Bán chạy nhất: theo số lượng đã bán (cập nhật thật khi đặt/hủy đơn), chỉ sản phẩm còn hàng */
  async bestSellers(limit = 10): Promise<ProductView[]> {
    return this.cached(`${CACHE_PREFIX}:best:${limit}`, 300, async () =>
      this.toViews(
        await this.prisma.product.findMany({
          where: { stock: { gt: 0 }, isActive: true },
          include: productInclude,
          orderBy: [{ soldCount: 'desc' }, { id: 'asc' }],
          take: limit,
        }),
      ),
    );
  }

  /** Giảm giá sâu nhất: sắp theo % giảm (biểu thức tính toán → dùng SQL thô để sắp xếp đúng) */
  async deals(limit = 12): Promise<ProductView[]> {
    return this.cached(`${CACHE_PREFIX}:deals:${limit}`, 300, async () => {
      const ids = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM products
        WHERE compare_at_price IS NOT NULL AND stock > 0 AND is_active
        ORDER BY (compare_at_price - price) / compare_at_price DESC, sold_count DESC
        LIMIT ${limit}`;
      const rows = await this.prisma.product.findMany({ where: { id: { in: ids.map((r) => r.id) } }, include: productInclude });
      const order = new Map(ids.map((r, i) => [r.id, i]));
      return this.toViews(rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!));
    });
  }

  async bySlug(slug: string): Promise<ProductView> {
    const key = `${CACHE_PREFIX}:slug:${slug}`;
    const cached = await this.redis.getJson<ProductView>(key);
    if (cached) return cached;

    const row = await this.prisma.product.findUnique({ where: { slug }, include: productInclude });
    if (!row || !row.isActive) throw new NotFoundException('Product not found');
    const [view] = await this.toViews([row]);
    await this.redis.setJson(key, view, 120);
    return view;
  }

  async idBySlug(slug: string): Promise<string> {
    const row = await this.prisma.product.findUnique({ where: { slug }, select: { id: true, isActive: true } });
    if (!row || !row.isActive) throw new NotFoundException('Product not found');
    return row.id;
  }

  /** Danh sách sắp hết hàng cho trang quản trị (không cache: cần số liệu thời gian thực) */
  async lowStock(threshold = 10): Promise<ProductView[]> {
    const rows = await this.prisma.product.findMany({
      where: { stock: { lte: threshold } },
      include: productInclude,
      orderBy: [{ stock: 'asc' }, { name: 'asc' }],
      take: 20,
    });
    return this.toViews(rows);
  }

  /** Danh sách cho trang quản trị: gồm cả sản phẩm đang ẩn, lọc theo tồn kho/trạng thái, không cache */
  async adminList(query: ListAdminProductsQuery): Promise<ProductPage & { counts: { all: number; active: number; hidden: number; out: number; low: number } }> {
    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status === 'active' ? { isActive: true } : query.status === 'hidden' ? { isActive: false } : {}),
      ...(query.stock === 'out' ? { stock: { lte: 0 } } : query.stock === 'low' ? { stock: { gt: 0, lte: 10 } } : query.stock === 'in' ? { stock: { gt: 0 } } : {}),
      ...(query.onSale ? { compareAtPrice: { not: null } } : {}),
      ...(query.q
        ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { slug: { contains: query.q.toLowerCase() } }] }
        : {}),
    };
    const [rows, total, all, active, out, low] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: ADMIN_ORDER_BY[query.sort],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { stock: { lte: 0 } } }),
      this.prisma.product.count({ where: { stock: { gt: 0, lte: 10 } } }),
    ]);
    return {
      items: await this.toViews(rows),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      counts: { all, active, hidden: all - active, out, low },
    };
  }

  /** Chi tiết theo id cho form sửa của admin (kể cả sản phẩm đang ẩn) */
  async adminById(id: string): Promise<ProductView> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!row) throw new NotFoundException('Product not found');
    return (await this.toViews([row]))[0];
  }

  async setActive(id: string, isActive: boolean): Promise<ProductView> {
    const exists = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Product not found');
    const row = await this.prisma.product.update({ where: { id }, data: { isActive }, include: productInclude });
    await this.invalidateCache();
    return (await this.toViews([row]))[0];
  }

  /** Xóa hẳn chỉ khi chưa từng có trong đơn hàng (giữ lịch sử đơn); ngược lại phải ẩn */
  async remove(id: string): Promise<{ name: string }> {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { name: true, _count: { select: { orderItems: true } } } });
    if (!product) throw new NotFoundException('Product not found');
    if (product._count.orderItems > 0) throw new ConflictException('Product already has orders, hide it instead');
    await this.prisma.product.delete({ where: { id } });
    await this.invalidateCache();
    return { name: product.name };
  }

  async create(dto: CreateProductDto): Promise<ProductView> {
    ProductsService.assertPricing(dto.price, dto.compareAtPrice);
    const { price, compareAtPrice, specs, ...rest } = dto;
    const row = await this.prisma.product.create({
      data: {
        ...rest,
        price: new Prisma.Decimal(price),
        compareAtPrice: compareAtPrice ? new Prisma.Decimal(compareAtPrice) : null,
        specs: (specs ?? {}) as Prisma.InputJsonValue,
        isHot: dto.isHot ?? false,
      },
      include: productInclude,
    });
    await this.invalidateCache();
    return (await this.toViews([row]))[0];
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    const current = await this.prisma.product.findUnique({ where: { id }, select: { price: true, compareAtPrice: true } });
    if (!current) throw new NotFoundException('Product not found');
    const { price, compareAtPrice, specs, ...rest } = dto;
    ProductsService.assertPricing(
      price ?? current.price.toFixed(2),
      compareAtPrice === undefined ? (current.compareAtPrice?.toFixed(2) ?? null) : compareAtPrice,
    );

    const row = await this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(price !== undefined ? { price: new Prisma.Decimal(price) } : {}),
        ...(compareAtPrice !== undefined ? { compareAtPrice: compareAtPrice ? new Prisma.Decimal(compareAtPrice) : null } : {}),
        ...(specs !== undefined ? { specs: specs as Prisma.InputJsonValue } : {}),
      },
      include: productInclude,
    });
    await this.invalidateCache();
    return (await this.toViews([row]))[0];
  }

  async updateStock(id: string, stock: number): Promise<ProductView> {
    const row = await this.prisma.product.update({ where: { id }, data: { stock }, include: productInclude });
    await this.invalidateCache();
    return (await this.toViews([row]))[0];
  }

  async attachImage(id: string, file: Buffer, mime: string): Promise<ProductView> {
    await this.prisma.product.findUniqueOrThrow({ where: { id }, select: { id: true } });
    const imageKey = await this.storage.uploadProductImage(id, file, mime);
    const row = await this.prisma.product.update({ where: { id }, data: { imageKey }, include: productInclude });
    await this.invalidateCache();
    return (await this.toViews([row]))[0];
  }

  invalidateCache(): Promise<void> {
    return this.redis.deleteByPattern(`${CACHE_PREFIX}:*`);
  }

  static assertPricing(price: string, compareAtPrice: string | null | undefined): void {
    if (compareAtPrice && new Prisma.Decimal(compareAtPrice).lte(new Prisma.Decimal(price))) {
      throw new BadRequestException('compareAtPrice must be greater than price');
    }
  }

  static discountPercent(price: Prisma.Decimal, compareAtPrice: Prisma.Decimal | null): number {
    if (!compareAtPrice || compareAtPrice.lte(price)) return 0;
    return compareAtPrice.minus(price).div(compareAtPrice).mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  }

  private async cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = await this.redis.getJson<T>(key);
    if (hit) return hit;
    const value = await load();
    await this.redis.setJson(key, value, ttl);
    return value;
  }

  private toViews(rows: ProductRow[]): Promise<ProductView[]> {
    return Promise.all(
      rows.map(async ({ imageKey, price, compareAtPrice, ratingAvg, ...rest }) => ({
        ...rest,
        price: price.toFixed(2),
        compareAtPrice: compareAtPrice?.toFixed(2) ?? null,
        discountPercent: ProductsService.discountPercent(price, compareAtPrice),
        ratingAvg: ratingAvg.toNumber(),
        imageUrl: await this.storage.getSignedImageUrl(imageKey),
      })),
    );
  }
}
