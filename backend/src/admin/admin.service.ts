import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductView, ProductsService } from '../products/products.service';

export interface DailyRevenue {
  day: string;
  revenue: string;
  orders: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  slug: string;
  quantity: number;
}

export interface DashboardStats {
  revenue: string;
  ordersByStatus: Record<OrderStatus, number>;
  totalOrders: number;
  customers: number;
  products: number;
  revenueLast7Days: DailyRevenue[];
  topProducts: TopProduct[];
  lowStock: ProductView[];
  generatedAt: string;
}

// Doanh thu chỉ tính đơn đã thanh toán trở đi (PENDING có thể bị hủy, CANCELLED đã hoàn kho)
const REVENUE_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SHIPPING, OrderStatus.COMPLETED];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async stats(): Promise<DashboardStats> {
    const [revenue, byStatus, customers, products, daily, top, lowStock] = await Promise.all([
      this.prisma.order.aggregate({ _sum: { totalAmount: true }, where: { status: { in: REVENUE_STATUSES } } }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.user.count({ where: { role: Role.CUSTOMER } }),
      this.prisma.product.count(),
      this.revenueLast7Days(),
      this.topProducts(),
      this.products.lowStock(),
    ]);

    const ordersByStatus = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const row of byStatus) ordersByStatus[row.status] = row._count._all;

    return {
      revenue: (revenue._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
      ordersByStatus,
      totalOrders: Object.values(ordersByStatus).reduce((a, b) => a + b, 0),
      customers,
      products,
      revenueLast7Days: daily,
      topProducts: top,
      lowStock,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Doanh thu 7 ngày gần nhất theo giờ Việt Nam; ngày không có đơn vẫn xuất hiện với giá trị 0 */
  private async revenueLast7Days(): Promise<DailyRevenue[]> {
    const rows = await this.prisma.$queryRaw<{ day: string; revenue: string; orders: number }[]>`
      WITH days AS (
        SELECT generate_series(
          (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 6,
          (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          interval '1 day'
        )::date AS day
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(o.total_amount), 0)::text AS revenue,
             COUNT(o.id)::int AS orders
      FROM days d
      LEFT JOIN orders o
        ON (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day
       AND o.status::text = ANY(${REVENUE_STATUSES as string[]})
      GROUP BY d.day
      ORDER BY d.day`;
    return rows.map((r) => ({ day: r.day, revenue: new Prisma.Decimal(r.revenue).toFixed(2), orders: Number(r.orders) }));
  }

  private async topProducts(): Promise<TopProduct[]> {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { status: { not: OrderStatus.CANCELLED } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });
    if (grouped.length === 0) return [];

    const names = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      select: { id: true, name: true, slug: true },
    });
    const byId = new Map(names.map((p) => [p.id, p]));
    return grouped.map((g) => ({
      productId: g.productId,
      name: byId.get(g.productId)?.name ?? 'N/A',
      slug: byId.get(g.productId)?.slug ?? '',
      quantity: g._sum.quantity ?? 0,
    }));
  }
}
