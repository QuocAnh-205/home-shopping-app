import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';

export interface CartLine {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  available: boolean;
}

export interface CartView {
  items: CartLine[];
  totalItems: number;
  totalAmount: number;
}

const CART_TTL_SECONDS = 7 * 24 * 3600;
const MAX_DISTINCT_ITEMS = 50;

@Injectable()
export class CartService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  static key(userId: string): string {
    return `cart:${userId}`;
  }

  /** Đọc raw giỏ hàng từ Redis Hash: field = productId, value = quantity */
  async getRaw(userId: string): Promise<Map<string, number>> {
    const raw = await this.redis.client.hgetall(CartService.key(userId));
    return new Map(
      Object.entries(raw)
        .map(([productId, qty]) => [productId, Number.parseInt(qty, 10)] as const)
        .filter(([, qty]) => Number.isInteger(qty) && qty > 0),
    );
  }

  async get(userId: string): Promise<CartView> {
    const raw = await this.getRaw(userId);
    if (raw.size === 0) return { items: [], totalItems: 0, totalAmount: 0 };

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...raw.keys()] } },
      select: { id: true, name: true, slug: true, price: true, stock: true, imageKey: true, isActive: true },
      orderBy: { name: 'asc' },
    });

    // Sản phẩm đã bị admin xóa hẳn: dọn khỏi giỏ để khách không bị kẹt khi đặt hàng
    const missing = [...raw.keys()].filter((id) => !products.some((p) => p.id === id));
    if (missing.length > 0) await this.redis.client.hdel(CartService.key(userId), ...missing);

    let total = 0;
    let totalItems = 0;
    const items: CartLine[] = await Promise.all(
      products.map(async (p) => {
        const quantity = raw.get(p.id) ?? 0;
        const lineTotal = p.price * quantity;
        total += lineTotal;
        totalItems += quantity;
        return {
          productId: p.id,
          name: p.name,
          slug: p.slug,
          imageUrl: await this.storage.getSignedImageUrl(p.imageKey),
          unitPrice: p.price,
          quantity,
          lineTotal,
          // Sản phẩm admin đã ẩn: vẫn hiện trong giỏ để khách thấy và tự xóa, nhưng không đặt được
          available: p.isActive && p.stock >= quantity,
        };
      }),
    );

    return { items, totalItems, totalAmount: total };
  }

  async upsertItem(userId: string, productId: string, quantity: number): Promise<CartView> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { stock: true, isActive: true } });
    if (!product || !product.isActive) throw new NotFoundException('Product not found');
    if (product.stock < quantity) throw new BadRequestException(`Only ${product.stock} items left in stock`);

    const key = CartService.key(userId);
    const exists = await this.redis.client.hexists(key, productId);
    if (!exists && (await this.redis.client.hlen(key)) >= MAX_DISTINCT_ITEMS) {
      throw new BadRequestException(`Cart cannot contain more than ${MAX_DISTINCT_ITEMS} products`);
    }

    await this.redis.client.multi().hset(key, productId, quantity).expire(key, CART_TTL_SECONDS).exec();
    return this.get(userId);
  }

  /** Cộng dồn số lượng (dùng cho "Mua lại"); tối đa 99 và không vượt tồn kho */
  async addQuantity(userId: string, productId: string, quantity: number): Promise<void> {
    const key = CartService.key(userId);
    const current = Number.parseInt((await this.redis.client.hget(key, productId)) ?? '0', 10) || 0;
    if (current === 0 && (await this.redis.client.hlen(key)) >= MAX_DISTINCT_ITEMS) return;
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { stock: true } });
    const next = Math.min(current + quantity, 99, product?.stock ?? 0);
    if (next <= 0) return;
    await this.redis.client.multi().hset(key, productId, next).expire(key, CART_TTL_SECONDS).exec();
  }

  /** Xóa các sản phẩm vừa đặt hàng khỏi giỏ (mua một phần giỏ: phần còn lại giữ nguyên) */
  async removeItems(userId: string, productIds: string[]): Promise<void> {
    if (productIds.length) await this.redis.client.hdel(CartService.key(userId), ...productIds);
  }

  async removeItem(userId: string, productId: string): Promise<CartView> {
    await this.redis.client.hdel(CartService.key(userId), productId);
    return this.get(userId);
  }

  async clear(userId: string): Promise<void> {
    await this.redis.client.del(CartService.key(userId));
  }
}
