import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { CategoryDto, ListNewsletterQuery } from './admin.dto';
import { toCsv } from './admin-users.service';

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  productCount: number;
  activeCount: number;
  stock: number;
  soldCount: number;
}

/** Danh mục & danh sách nhận bản tin cho trang quản trị */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  async listCategories(): Promise<AdminCategory[]> {
    const [categories, stats] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.product.groupBy({ by: ['categoryId', 'isActive'], _count: { _all: true }, _sum: { stock: true, soldCount: true } }),
    ]);
    return categories.map((c) => {
      const rows = stats.filter((s) => s.categoryId === c.id);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        productCount: rows.reduce((n, r) => n + r._count._all, 0),
        activeCount: rows.filter((r) => r.isActive).reduce((n, r) => n + r._count._all, 0),
        stock: rows.reduce((n, r) => n + (r._sum.stock ?? 0), 0),
        soldCount: rows.reduce((n, r) => n + (r._sum.soldCount ?? 0), 0),
      };
    });
  }

  async createCategory(actorId: string, dto: CategoryDto): Promise<AdminCategory> {
    const row = await this.prisma.category.create({ data: dto }).catch((err) => AdminCatalogService.uniqueError(err));
    await this.products.invalidateCache();
    await this.audit.log({ actorId, action: 'category.create', entityType: 'category', entityId: String(row.id), summary: `Tạo danh mục "${row.name}"` });
    return { ...row, productCount: 0, activeCount: 0, stock: 0, soldCount: 0 };
  }

  async updateCategory(actorId: string, id: number, dto: CategoryDto): Promise<AdminCategory> {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Category not found');
    await this.prisma.category.update({ where: { id }, data: dto }).catch((err) => AdminCatalogService.uniqueError(err));
    await this.products.invalidateCache();
    await this.audit.log({
      actorId,
      action: 'category.update',
      entityType: 'category',
      entityId: String(id),
      summary: `Sửa danh mục "${before.name}" → "${dto.name}" (/${dto.slug})`,
      metadata: { before: { name: before.name, slug: before.slug }, after: dto },
    });
    return (await this.listCategories()).find((c) => c.id === id)!;
  }

  async deleteCategory(actorId: string, id: number): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!category) throw new NotFoundException('Category not found');
    if (category._count.products > 0) throw new ConflictException('Category still has products, move them first');
    await this.prisma.category.delete({ where: { id } });
    await this.products.invalidateCache();
    await this.audit.log({ actorId, action: 'category.delete', entityType: 'category', entityId: String(id), summary: `Xóa danh mục "${category.name}"` });
  }

  async listNewsletter(query: ListNewsletterQuery) {
    const where: Prisma.NewsletterSubscriberWhereInput = query.q ? { email: { contains: query.q, mode: 'insensitive' } } : {};
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const [items, total, all, last30d] = await this.prisma.$transaction([
      this.prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.newsletterSubscriber.count({ where }),
      this.prisma.newsletterSubscriber.count(),
      this.prisma.newsletterSubscriber.count({ where: { createdAt: { gte: since30 } } }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)), counts: { all, last30d } };
  }

  async deleteSubscriber(actorId: string, id: number): Promise<void> {
    const row = await this.prisma.newsletterSubscriber.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Subscriber not found');
    await this.prisma.newsletterSubscriber.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'newsletter.delete', entityType: 'newsletter', entityId: String(id), summary: `Xóa ${row.email} khỏi danh sách nhận tin` });
  }

  async exportNewsletter(): Promise<string> {
    const rows = await this.prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' }, take: 50_000 });
    return toCsv([['Email', 'Ngày đăng ký'], ...rows.map((r) => [r.email, r.createdAt.toISOString()])]);
  }

  private static uniqueError(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictException('Category name or slug already exists');
    }
    throw err;
  }
}
