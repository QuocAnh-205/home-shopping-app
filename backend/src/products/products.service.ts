import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { CreateProductDto, ListProductsQuery, ProductSort, UpdateProductDto } from './products.dto';

const productInclude = { category: { select: { id: true, name: true, slug: true } } } satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export type ProductView = Omit<ProductRow, 'imageKey' | 'price'> & { price: string; imageUrl: string | null };

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
};

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
      query.sort,
      query.page,
      query.limit,
    ].join(':');
    const cached = await this.redis.getJson<ProductPage>(key);
    if (cached) return cached;

    const where: Prisma.ProductWhereInput = {
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
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

  async hot(): Promise<ProductView[]> {
    const key = `${CACHE_PREFIX}:hot`;
    const cached = await this.redis.getJson<ProductView[]>(key);
    if (cached) return cached;

    const rows = await this.prisma.product.findMany({
      where: { isHot: true, stock: { gt: 0 } },
      include: productInclude,
      take: 8,
      orderBy: { updatedAt: 'desc' },
    });
    const result = await this.toViews(rows);
    await this.redis.setJson(key, result, 300);
    return result;
  }

  async bySlug(slug: string): Promise<ProductView> {
    const key = `${CACHE_PREFIX}:slug:${slug}`;
    const cached = await this.redis.getJson<ProductView>(key);
    if (cached) return cached;

    const row = await this.prisma.product.findUnique({ where: { slug }, include: productInclude });
    if (!row) throw new NotFoundException('Product not found');
    const [view] = await this.toViews([row]);
    await this.redis.setJson(key, view, 120);
    return view;
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

  async create(dto: CreateProductDto): Promise<ProductView> {
    const row = await this.prisma.product.create({
      data: { ...dto, price: new Prisma.Decimal(dto.price), isHot: dto.isHot ?? false },
      include: productInclude,
    });
    await this.invalidateCache();
    return (await this.toViews([row]))[0];
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    const { price, ...rest } = dto;
    const row = await this.prisma.product.update({
      where: { id },
      data: { ...rest, ...(price !== undefined ? { price: new Prisma.Decimal(price) } : {}) },
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

  private toViews(rows: ProductRow[]): Promise<ProductView[]> {
    return Promise.all(
      rows.map(async ({ imageKey, price, ...rest }) => ({
        ...rest,
        price: price.toFixed(2),
        imageUrl: await this.storage.getSignedImageUrl(imageKey),
      })),
    );
  }
}
