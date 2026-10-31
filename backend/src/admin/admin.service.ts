import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductView, ProductsService } from '../products/products.service';
import { StorageService } from '../storage/storage.service';

export interface DailyRevenue {
  day: string;
  revenue: string;
  orders: number;
}

export interface DashboardKpis {
  /** Doanh thu toàn thời gian (đơn đã thanh toán trở đi) */
  revenueAll: string;
  revenueToday: string;
  revenueYesterday: string;
  revenue30d: string;
  revenuePrev30d: string;
  ordersToday: number;
  ordersYesterday: number;
  paidOrders30d: number;
  paidOrdersPrev30d: number;
  /** Giá trị trung bình mỗi đơn đã thanh toán trong 30 ngày */
  avgOrderValue30d: string;
  unitsSold30d: number;
  newCustomers30d: number;
  newCustomersPrev30d: number;
  customers: number;
  products: number;
  outOfStock: number;
  pendingOrders: number;
}

export interface CategoryRevenue {
  slug: string;
  name: string;
  revenue: string;
  units: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  quantity: number;
  revenue: string;
}

export interface RecentOrder {
  id: string;
  customer: string;
  totalAmount: string;
  status: OrderStatus;
  createdAt: Date;
  itemCount: number;
}

export interface ReviewStats {
  average: number;
  count: number;
  last30d: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface DashboardStats {
  kpis: DashboardKpis;
  ordersByStatus: Record<OrderStatus, number>;
  totalOrders: number;
  revenueDaily: DailyRevenue[];
  revenueByCategory: CategoryRevenue[];
  topProducts: TopProduct[];
  recentOrders: RecentOrder[];
  reviews: ReviewStats;
  lowStock: ProductView[];
  generatedAt: string;
}

// Doanh thu chỉ tính đơn đã thanh toán trở đi (PENDING có thể bị hủy, CANCELLED đã hoàn kho)
const REVENUE_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SHIPPING, OrderStatus.COMPLETED];
const REVENUE = Prisma.sql`o.status::text = ANY(${REVENUE_STATUSES as string[]})`;
/** Ngày theo giờ Việt Nam: created_at lưu UTC (timestamp without time zone) */
const LOCAL_DAY = Prisma.sql`(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
const TODAY = Prisma.sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

const dec = (v: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(v ?? 0).toFixed(2);

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly storage: StorageService,
  ) {}

  async stats(): Promise<DashboardStats> {
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const since60 = new Date(Date.now() - 60 * 86_400_000);

    const [kpiRow, byStatus, customers, newCustomers30d, newCustomersPrev30d, products, outOfStock, daily, byCategory, top, recent, reviews, lowStock] =
      await Promise.all([
        this.kpiRow(),
        this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.user.count({ where: { role: Role.CUSTOMER } }),
        this.prisma.user.count({ where: { role: Role.CUSTOMER, createdAt: { gte: since30 } } }),
        this.prisma.user.count({ where: { role: Role.CUSTOMER, createdAt: { gte: since60, lt: since30 } } }),
        this.prisma.product.count(),
        this.prisma.product.count({ where: { stock: { lte: 0 } } }),
        this.revenueDaily(30),
        this.revenueByCategory(),
        this.topProducts(),
        this.recentOrders(),
        this.reviewStats(since30),
        this.products.lowStock(),
      ]);

    const ordersByStatus = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const row of byStatus) ordersByStatus[row.status] = row._count._all;

    const revenue30 = new Prisma.Decimal(kpiRow.revenue_30d);
    const paid30 = Number(kpiRow.paid_orders_30d);

    return {
      kpis: {
        revenueAll: dec(kpiRow.revenue_all),
        revenueToday: dec(kpiRow.revenue_today),
        revenueYesterday: dec(kpiRow.revenue_yesterday),
        revenue30d: dec(revenue30),
        revenuePrev30d: dec(kpiRow.revenue_prev_30d),
        ordersToday: Number(kpiRow.orders_today),
        ordersYesterday: Number(kpiRow.orders_yesterday),
        paidOrders30d: paid30,
        paidOrdersPrev30d: Number(kpiRow.paid_orders_prev_30d),
        avgOrderValue30d: paid30 ? revenue30.div(paid30).toFixed(2) : '0.00',
        unitsSold30d: Number(kpiRow.units_30d),
        newCustomers30d,
        newCustomersPrev30d,
        customers,
        products,
        outOfStock,
        pendingOrders: ordersByStatus.PENDING,
      },
      ordersByStatus,
      totalOrders: Object.values(ordersByStatus).reduce((a, b) => a + b, 0),
      revenueDaily: daily,
      revenueByCategory: byCategory,
      topProducts: top,
      recentOrders: recent,
      reviews,
      lowStock,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Mọi chỉ số doanh thu/đơn hàng trong 1 lần quét bảng orders (FILTER thay vì nhiều truy vấn) */
  private async kpiRow() {
    const [row] = await this.prisma.$queryRaw<
      {
        revenue_all: string;
        revenue_today: string;
        revenue_yesterday: string;
        revenue_30d: string;
        revenue_prev_30d: string;
        orders_today: number;
        orders_yesterday: number;
        paid_orders_30d: number;
        paid_orders_prev_30d: number;
        units_30d: number;
      }[]
    >`
      WITH o AS (
        SELECT o.id, o.total_amount, ${REVENUE} AS rev, ${LOCAL_DAY} AS d, o.status
        FROM orders o
      )
      SELECT
        COALESCE(SUM(total_amount) FILTER (WHERE rev), 0)::text                                              AS revenue_all,
        COALESCE(SUM(total_amount) FILTER (WHERE rev AND d = ${TODAY}), 0)::text                             AS revenue_today,
        COALESCE(SUM(total_amount) FILTER (WHERE rev AND d = ${TODAY} - 1), 0)::text                         AS revenue_yesterday,
        COALESCE(SUM(total_amount) FILTER (WHERE rev AND d > ${TODAY} - 30), 0)::text                        AS revenue_30d,
        COALESCE(SUM(total_amount) FILTER (WHERE rev AND d <= ${TODAY} - 30 AND d > ${TODAY} - 60), 0)::text AS revenue_prev_30d,
        COUNT(*) FILTER (WHERE d = ${TODAY})::int                                                            AS orders_today,
        COUNT(*) FILTER (WHERE d = ${TODAY} - 1)::int                                                        AS orders_yesterday,
        COUNT(*) FILTER (WHERE rev AND d > ${TODAY} - 30)::int                                               AS paid_orders_30d,
        COUNT(*) FILTER (WHERE rev AND d <= ${TODAY} - 30 AND d > ${TODAY} - 60)::int                        AS paid_orders_prev_30d,
        COALESCE((
          SELECT SUM(oi.quantity) FROM order_items oi JOIN o ON o.id = oi.order_id
          WHERE o.status <> 'CANCELLED' AND o.d > ${TODAY} - 30
        ), 0)::int                                                                                           AS units_30d
      FROM o`;
    return row;
  }

  /** Doanh thu theo ngày (giờ Việt Nam); ngày không có đơn vẫn xuất hiện với giá trị 0 */
  private async revenueDaily(days: number): Promise<DailyRevenue[]> {
    const rows = await this.prisma.$queryRaw<{ day: string; revenue: string; orders: number }[]>`
      WITH days AS (
        SELECT generate_series(${TODAY} - ${days - 1}::int, ${TODAY}, interval '1 day')::date AS day
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(o.total_amount), 0)::text AS revenue,
             COUNT(o.id)::int AS orders
      FROM days d
      LEFT JOIN orders o ON ${LOCAL_DAY} = d.day AND ${REVENUE}
      GROUP BY d.day
      ORDER BY d.day`;
    return rows.map((r) => ({ day: r.day, revenue: dec(r.revenue), orders: Number(r.orders) }));
  }

  private async revenueByCategory(): Promise<CategoryRevenue[]> {
    const rows = await this.prisma.$queryRaw<{ slug: string; name: string; revenue: string; units: number }[]>`
      SELECT c.slug, c.name, COALESCE(x.revenue, 0)::text AS revenue, COALESCE(x.units, 0)::int AS units
      FROM categories c
      LEFT JOIN (
        SELECT p.category_id, SUM(oi.quantity * oi.unit_price) AS revenue, SUM(oi.quantity) AS units
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE ${REVENUE} AND ${LOCAL_DAY} > ${TODAY} - 30
        GROUP BY p.category_id
      ) x ON x.category_id = c.id
      ORDER BY x.revenue DESC NULLS LAST, c.name`;
    return rows.map((r) => ({ slug: r.slug, name: r.name, revenue: dec(r.revenue), units: Number(r.units) }));
  }

  /** Top 5 sản phẩm 30 ngày theo doanh thu (đơn không bị hủy) */
  private async topProducts(): Promise<TopProduct[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; slug: string; image_key: string | null; quantity: number; revenue: string }[]
    >`
      SELECT p.id, p.name, p.slug, p.image_key,
             SUM(oi.quantity)::int AS quantity,
             SUM(oi.quantity * oi.unit_price)::text AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.status <> 'CANCELLED' AND ${LOCAL_DAY} > ${TODAY} - 30
      GROUP BY p.id
      ORDER BY SUM(oi.quantity * oi.unit_price) DESC
      LIMIT 5`;
    return Promise.all(
      rows.map(async (r) => ({
        productId: r.id,
        name: r.name,
        slug: r.slug,
        imageUrl: await this.storage.getSignedImageUrl(r.image_key),
        quantity: Number(r.quantity),
        revenue: dec(r.revenue),
      })),
    );
  }

  private async recentOrders(): Promise<RecentOrder[]> {
    const rows = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        user: { select: { fullName: true } },
        _count: { select: { items: true } },
      },
    });
    return rows.map((o) => ({
      id: o.id,
      customer: o.user.fullName,
      totalAmount: o.totalAmount.toFixed(2),
      status: o.status,
      createdAt: o.createdAt,
      itemCount: o._count.items,
    }));
  }

  private async reviewStats(since: Date): Promise<ReviewStats> {
    const [agg, recent, groups] = await Promise.all([
      this.prisma.review.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.review.count({ where: { createdAt: { gte: since } } }),
      this.prisma.review.groupBy({ by: ['rating'], _count: { _all: true } }),
    ]);
    const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as ReviewStats['distribution'];
    for (const g of groups) distribution[String(g.rating) as keyof ReviewStats['distribution']] = g._count._all;
    return {
      average: Math.round((agg._avg.rating ?? 0) * 100) / 100,
      count: agg._count._all,
      last30d: recent,
      distribution,
    };
  }
}
