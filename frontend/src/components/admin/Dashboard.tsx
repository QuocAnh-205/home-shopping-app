'use client';

import {
  faArrowDown,
  faArrowRight,
  faArrowUp,
  faBoxOpen,
  faChartLine,
  faChartPie,
  faCoins,
  faHourglassHalf,
  faLayerGroup,
  faMinus,
  faReceipt,
  faRotate,
  faSpinner,
  faStar,
  faTrophy,
  faTriangleExclamation,
  faUserPlus,
  faWarehouse,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ProductImage } from '@/components/ProductImage';
import { Stars } from '@/components/Stars';
import { StatusBadge } from '@/components/StatusBadge';
import { apiFetch, useSession } from '@/lib/client-api';
import { formatDate, formatPrice, shortId, type DashboardStats } from '@/lib/types';
import { HBars, RevenueChart, Sparkline, StatusBreakdown } from './charts';
import { StockEditor } from './StockEditor';

const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const longDate = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });

/** % thay đổi so với kỳ trước; mũi tên + chữ để không phụ thuộc màu */
function Delta({ now, prev, label }: { now: number; prev: number; label: string }) {
  if (prev === 0 && now === 0) {
    return (
      <span className="delta delta-flat">
        <FontAwesomeIcon icon={faMinus} /> Không đổi {label}
      </span>
    );
  }
  if (prev === 0) {
    return (
      <span className="delta delta-up">
        <FontAwesomeIcon icon={faArrowUp} /> Mới {label}
      </span>
    );
  }
  const change = ((now - prev) / prev) * 100;
  const dir = Math.abs(change) < 0.5 ? 'flat' : change > 0 ? 'up' : 'down';
  return (
    <span className={`delta delta-${dir}`}>
      <FontAwesomeIcon icon={dir === 'up' ? faArrowUp : dir === 'down' ? faArrowDown : faMinus} />
      {dir === 'flat' ? 'Không đổi' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`} {label}
    </span>
  );
}

function Tile({ icon, tone, label, value, children }: { icon: IconDefinition; tone: string; label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-head">
        {label}
        <span className={`kpi-ico ${tone}`}>
          <FontAwesomeIcon icon={icon} />
        </span>
      </div>
      <strong>{value}</strong>
      {children}
    </div>
  );
}

function Card({ icon, title, action, children, className = '' }: { icon: IconDefinition; title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel dash-card ${className}`}>
      <header className="dash-card-head">
        <h2 className="panel-title" style={{ margin: 0 }}>
          <span className="fa-icon-wrap">
            <FontAwesomeIcon icon={icon} />
          </span>
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Dashboard({ onOpenOrders }: { onOpenOrders?: () => void }) {
  const { session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<DashboardStats>('/admin/stats')
      .then((s) => {
        setStats(s);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (error && !stats) {
    return (
      <p className="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
      </p>
    );
  }
  if (!stats) {
    return (
      <div className="skeleton">
        <FontAwesomeIcon icon={faSpinner} spin /> Đang tải thống kê…
      </div>
    );
  }

  const k = stats.kpis;
  const revenue30 = Number(k.revenue30d);
  const totalCategoryRevenue = stats.revenueByCategory.reduce((s, c) => s + Number(c.revenue), 0);

  return (
    <div className="dashboard">
      <div className="dash-top">
        <div>
          <h2 className="dash-greeting">Xin chào, {session?.user.fullName ?? 'quản trị viên'}</h2>
          <p className="muted">
            {longDate.format(new Date())} · Số liệu doanh thu tính trên đơn đã thanh toán trở đi
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <FontAwesomeIcon icon={faRotate} spin={loading} /> Làm mới
        </button>
      </div>

      <div className="dash-kpis">
        <div className="kpi kpi-hero">
          <div className="kpi-head">
            Doanh thu 30 ngày
            <span className="kpi-ico ico-orange">
              <FontAwesomeIcon icon={faCoins} />
            </span>
          </div>
          <strong className="hero-figure">{formatPrice(k.revenue30d)}</strong>
          <Delta now={revenue30} prev={Number(k.revenuePrev30d)} label="so với 30 ngày trước" />
          <Sparkline values={stats.revenueDaily.map((d) => Number(d.revenue))} />
          <span className="muted small">Tổng doanh thu từ trước tới nay: {formatPrice(k.revenueAll)}</span>
        </div>

        <Tile icon={faChartLine} tone="ico-green" label="Doanh thu hôm nay" value={formatPrice(k.revenueToday)}>
          <Delta now={Number(k.revenueToday)} prev={Number(k.revenueYesterday)} label="so với hôm qua" />
        </Tile>
        <Tile icon={faReceipt} tone="ico-blue" label="Đơn hàng hôm nay" value={k.ordersToday}>
          <Delta now={k.ordersToday} prev={k.ordersYesterday} label="so với hôm qua" />
        </Tile>
        <Tile icon={faLayerGroup} tone="ico-violet" label="Giá trị trung bình / đơn" value={formatPrice(k.avgOrderValue30d)}>
          <span className="muted small">
            {k.paidOrders30d} đơn đã thanh toán · {compact.format(k.unitsSold30d)} sản phẩm bán ra (30 ngày)
          </span>
        </Tile>
        <Tile icon={faUserPlus} tone="ico-green" label="Khách hàng mới (30 ngày)" value={k.newCustomers30d}>
          <span className="muted small">Tổng {k.customers} khách hàng</span>
        </Tile>
        <Tile icon={faHourglassHalf} tone="ico-orange" label="Đơn chờ xác nhận" value={k.pendingOrders}>
          {k.pendingOrders > 0 && onOpenOrders ? (
            <button className="link-btn small" onClick={onOpenOrders}>
              Xử lý ngay <FontAwesomeIcon icon={faArrowRight} />
            </button>
          ) : (
            <span className="muted small">Không có đơn tồn đọng</span>
          )}
        </Tile>
        <Tile icon={faWarehouse} tone="ico-violet" label="Sản phẩm hết hàng" value={k.outOfStock}>
          <span className="muted small">
            Trên tổng {k.products} sản phẩm · {stats.lowStock.length} sắp hết
          </span>
        </Tile>
      </div>

      <div className="dash-grid dash-grid-2-1">
        <Card icon={faChartLine} title="Doanh thu 30 ngày gần nhất">
          <RevenueChart data={stats.revenueDaily} />
        </Card>
        <Card icon={faChartPie} title={`Trạng thái đơn hàng · ${stats.totalOrders} đơn`}>
          <StatusBreakdown counts={stats.ordersByStatus} />
        </Card>
      </div>

      <div className="dash-grid dash-grid-1-1">
        <Card icon={faLayerGroup} title="Doanh thu theo danh mục (30 ngày)">
          {totalCategoryRevenue === 0 ? (
            <p className="muted">Chưa có doanh thu trong 30 ngày.</p>
          ) : (
            <HBars
              rows={stats.revenueByCategory.map((c) => ({
                key: c.slug,
                label: c.name,
                value: Number(c.revenue),
                display: compact.format(Number(c.revenue)),
                sub: `${c.units} sp · ${Math.round((Number(c.revenue) / totalCategoryRevenue) * 100)}%`,
              }))}
            />
          )}
        </Card>
        <Card icon={faTrophy} title="Sản phẩm doanh thu cao nhất (30 ngày)">
          {stats.topProducts.length === 0 ? (
            <p className="muted">Chưa có dữ liệu bán hàng.</p>
          ) : (
            <ol className="top-products">
              {stats.topProducts.map((p, i) => (
                <li key={p.productId}>
                  <span className="rank">{i + 1}</span>
                  <span className="thumb-sm">
                    <ProductImage product={{ name: p.name, imageUrl: p.imageUrl }} />
                  </span>
                  <span className="top-info">
                    <Link className="link" href={`/products/${p.slug}`}>
                      {p.name}
                    </Link>
                    <small className="muted">{p.quantity} đã bán</small>
                  </span>
                  <strong className="num">{formatPrice(p.revenue)}</strong>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="dash-grid dash-grid-2-1">
        <Card
          icon={faReceipt}
          title="Đơn hàng mới nhất"
          action={
            onOpenOrders && (
              <button className="link-btn small" onClick={onOpenOrders}>
                Tất cả đơn <FontAwesomeIcon icon={faArrowRight} />
              </button>
            )
          }
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Khách hàng</th>
                  <th>Thời gian</th>
                  <th className="num">Tổng tiền</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>#{shortId(o.id)}</strong>
                      <div className="muted small">{o.itemCount} sản phẩm</div>
                    </td>
                    <td>{o.customer}</td>
                    <td className="small">{formatDate(o.createdAt)}</td>
                    <td className="num">
                      <strong>{formatPrice(o.totalAmount)}</strong>
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card icon={faStar} title="Đánh giá khách hàng">
          <div className="review-score">
            <strong>{stats.reviews.count ? stats.reviews.average.toFixed(1) : '–'}</strong>
            <div>
              <Stars value={stats.reviews.average} size="lg" />
              <span className="muted small">
                {stats.reviews.count} đánh giá · {stats.reviews.last30d} trong 30 ngày
              </span>
            </div>
          </div>
          <HBars
            rows={(['5', '4', '3', '2', '1'] as const).map((s) => ({
              key: s,
              label: `${s} sao`,
              value: stats.reviews.distribution[s],
              display: String(stats.reviews.distribution[s]),
            }))}
          />
        </Card>
      </div>

      <Card icon={faBoxOpen} title={`Sắp hết hàng (≤ 10) · ${stats.lowStock.length} sản phẩm`}>
        {stats.lowStock.length === 0 ? (
          <p className="muted">Tồn kho ổn định.</p>
        ) : (
          <ul className="low-stock-grid">
            {stats.lowStock.map((p) => (
              <li key={p.id}>
                <span className="thumb-sm">
                  <ProductImage product={p} />
                </span>
                <span className="top-info">
                  <Link className="link" href={`/products/${p.slug}`}>
                    {p.name}
                  </Link>
                  <small className={p.stock === 0 ? 'danger' : 'warn'}>{p.stock === 0 ? 'Hết hàng' : `Còn ${p.stock}`}</small>
                </span>
                <StockEditor key={`${p.id}-${p.stock}`} productId={p.id} stock={p.stock} onSaved={load} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="muted small">
        <FontAwesomeIcon icon={faRotate} /> Cập nhật lúc {formatDate(stats.generatedAt)} · tự làm mới mỗi phút
      </p>
    </div>
  );
}
