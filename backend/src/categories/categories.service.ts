import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface CategoryView {
  id: number;
  name: string;
  slug: string;
  productCount: number;
}

// Nằm chung prefix với cache sản phẩm → thêm/sửa sản phẩm sẽ làm mới cả số lượng theo danh mục
const CACHE_KEY = 'cache:products:categories';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(): Promise<CategoryView[]> {
    const cached = await this.redis.getJson<CategoryView[]>(CACHE_KEY);
    if (cached) return cached;

    const rows = await this.prisma.category.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    const result = rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, productCount: c._count.products }));
    await this.redis.setJson(CACHE_KEY, result, 300);
    return result;
  }
}
