import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import type { AdminProductSort, ListAdminProductsQuery } from '../admin/admin.dto';
import { deriveAttributes, MATERIAL_OPTIONS } from './product-attributes';
import { CAPACITY_BUCKETS, CreateProductDto, ListProductsQuery, POWER_BUCKETS, ProductSort, UpdateProductDto } from './products.dto';

const productInclude = { category: { select: { id: true, name: true, slug: true } } } satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export type ProductView = Omit<ProductRow, 'imageKey' | 'ratingAvg'> & {
  /** % giảm làm tròn, 0 nếu không khuyến mãi */
  discountPercent: number;
  ratingAvg: number;
  imageUrl: string | null;
};

/** 1 lựa chọn trong bộ chọn biến thể (mỗi biến thể là 1 SKU riêng) */
export interface ProductVariantOption {
  slug: string;
  label: string;
  price: number;
  stock: number;
  imageUrl: string | null;
}

export type ProductDetail = ProductView & { variants: ProductVariantOption[] };

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

/** Số sản phẩm theo từng lựa chọn của bộ lọc kỹ thuật (chỉ hiện lựa chọn có hàng) */
export interface ProductFacets {
  materials: { value: string; count: number }[];
  power: { value: string; count: number }[];
  capacity: { value: string; count: number }[];
  bulky: number;
  withDimensions: number;
}

/** [gte, lt) → điều kiện Prisma trên 1 cột số */
function rangeWhere(range: readonly [number | null, number | null]): Prisma.IntNullableFilter {
  return { not: null, ...(range[0] !== null ? { gte: range[0] } : {}), ...(range[1] !== null ? { lt: range[1] } : {}) };
}

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
      query.material ? encodeURIComponent(query.material) : '-',
      query.power ?? '-',
      query.capacity ?? '-',
      query.maxLength ?? '-',
      query.bulky ? 'bulky' : '-',
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
      ...(query.material ? { material: query.material } : {}),
      ...(query.power ? { powerW: rangeWhere(POWER_BUCKETS[query.power]) } : {}),
      ...(query.capacity ? { capacityMl: rangeWhere(CAPACITY_BUCKETS[query.capacity]) } : {}),
      ...(query.maxLength ? { dimLengthCm: { not: null, lte: query.maxLength } } : {}),
      ...(query.bulky ? { isBulky: true } : {}),
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

  async bySlug(slug: string): Promise<ProductDetail> {
    const key = `${CACHE_PREFIX}:slug:${slug}`;
    const cached = await this.redis.getJson<ProductDetail>(key);
    if (cached) return cached;

    const row = await this.prisma.product.findUnique({ where: { slug }, include: productInclude });
    if (!row || !row.isActive) throw new NotFoundException('Product not found');
    const [view] = await this.toViews([row]);
    // Các SKU cùng nhóm biến thể (kể cả chính nó) theo giá tăng dần → bộ chọn màu / kích cỡ / dung tích
    const siblings = row.variantGroup
      ? await this.prisma.product.findMany({
          where: { variantGroup: row.variantGroup, isActive: true },
          select: { slug: true, variantLabel: true, name: true, price: true, stock: true, imageKey: true },
          orderBy: [{ price: 'asc' }, { slug: 'asc' }],
        })
      : [];
    const variants = await Promise.all(
      siblings.map(async (v) => ({
        slug: v.slug,
        label: v.variantLabel ?? v.name,
        price: v.price,
        stock: v.stock,
        imageUrl: await this.storage.getSignedImageUrl(v.imageKey),
      })),
    );
    const detail: ProductDetail = { ...view, variants: variants.length > 1 ? variants : [] };
    await this.redis.setJson(key, detail, 120);
    return detail;
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

  /** Trang so sánh: lấy theo danh sách slug, giữ thứ tự, bỏ sản phẩm đã ẩn */
  async bySlugs(slugs: string[]): Promise<ProductView[]> {
    const rows = await this.prisma.product.findMany({ where: { slug: { in: slugs }, isActive: true }, include: productInclude });
    const views = await this.toViews(rows);
    return slugs.map((slug) => views.find((v) => v.slug === slug)).filter((v): v is ProductView => Boolean(v));
  }

  /** Bộ lọc kỹ thuật: số sản phẩm cho từng lựa chọn trong danh mục đang xem (cache 5 phút) */
  async facets(category?: string): Promise<ProductFacets> {
    const key = `${CACHE_PREFIX}:facets:${category ?? 'all'}`;
    const cached = await this.redis.getJson<ProductFacets>(key);
    if (cached) return cached;
    const base: Prisma.ProductWhereInput = { isActive: true, ...(category ? { category: { slug: category } } : {}) };
    const count = (where: Prisma.ProductWhereInput) => this.prisma.product.count({ where: { ...base, ...where } });
    const materials = await this.prisma.product.groupBy({ by: ['material'], where: { ...base, material: { not: null } }, _count: { _all: true } });
    const result: ProductFacets = {
      materials: MATERIAL_OPTIONS.map((value) => ({ value, count: materials.find((m) => m.material === value)?._count._all ?? 0 })).filter((m) => m.count > 0),
      power: (
        await Promise.all(Object.entries(POWER_BUCKETS).map(async ([value, range]) => ({ value, count: await count({ powerW: rangeWhere(range) }) })))
      ).filter((b) => b.count > 0),
      capacity: (
        await Promise.all(Object.entries(CAPACITY_BUCKETS).map(async ([value, range]) => ({ value, count: await count({ capacityMl: rangeWhere(range) }) })))
      ).filter((b) => b.count > 0),
      bulky: await count({ isBulky: true }),
      withDimensions: await count({ dimLengthCm: { not: null } }),
    };
    await this.redis.setJson(key, result, 300);
    return result;
  }

  /** Thuộc tính chuẩn hóa (chất liệu, công suất, kích thước, cồng kềnh…) suy từ tên + thông số – cùng logic với seed */
  private async attributesFor(name: string, specs: Record<string, string>, categoryId: number) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { slug: true } });
    const { estimatedWeightGrams: _estimated, ...columns } = deriveAttributes({ name, categorySlug: category?.slug ?? null, specs });
    return columns;
  }

  async create(dto: CreateProductDto): Promise<ProductView> {
    ProductsService.assertPricing(dto.price, dto.compareAtPrice);
    const { compareAtPrice, specs, ...rest } = dto;
    const row = await this.prisma.product.create({
      data: {
        ...rest,
        ...(await this.attributesFor(dto.name, specs ?? {}, dto.categoryId)),
        compareAtPrice: compareAtPrice ?? null,
        specs: (specs ?? {}) as Prisma.InputJsonValue,
        isHot: dto.isHot ?? false,
      },
      include: productInclude,
    });
    await this.invalidateCache();
    return (await this.toViews([row]))[0];
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    const current = await this.prisma.product.findUnique({
      where: { id },
      select: { price: true, compareAtPrice: true, name: true, specs: true, categoryId: true },
    });
    if (!current) throw new NotFoundException('Product not found');
    const { compareAtPrice, specs, ...rest } = dto;
    ProductsService.assertPricing(dto.price ?? current.price, compareAtPrice === undefined ? current.compareAtPrice : compareAtPrice);
    const attributes =
      dto.name !== undefined || specs !== undefined || dto.categoryId !== undefined
        ? await this.attributesFor(dto.name ?? current.name, specs ?? (current.specs as Record<string, string>), dto.categoryId ?? current.categoryId)
        : {};

    const row = await this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...attributes,
        ...(compareAtPrice !== undefined ? { compareAtPrice: compareAtPrice || null } : {}),
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

  static assertPricing(price: number, compareAtPrice: number | null | undefined): void {
    if (compareAtPrice && compareAtPrice <= price) {
      throw new BadRequestException('compareAtPrice must be greater than price');
    }
  }

  /** % giảm làm tròn (số nguyên), 0 nếu không khuyến mãi */
  static discountPercent(price: number, compareAtPrice: number | null): number {
    if (!compareAtPrice || compareAtPrice <= price) return 0;
    return Math.round(((compareAtPrice - price) * 100) / compareAtPrice);
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
      rows.map(async ({ imageKey, ratingAvg, ...rest }) => ({
        ...rest,
        discountPercent: ProductsService.discountPercent(rest.price, rest.compareAtPrice),
        ratingAvg: ratingAvg.toNumber(),
        imageUrl: await this.storage.getSignedImageUrl(imageKey),
      })),
    );
  }
}
