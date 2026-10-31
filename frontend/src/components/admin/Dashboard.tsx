'use client';

import {
  faBoxesStacked,
  faChartColumn,
  faChartPie,
  faCoins,
  faRankingStar,
  faReceipt,
  faRotate,
  faSpinner,
  faTriangleExclamation,
  faUsers,
  faWarehouse,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { STATUS_ICON } from '@/components/StatusBadge';
import { apiFetch } from '@/lib/client-api';
import { STATUS_LABEL, formatDate, formatPrice, type DashboardStats, type OrderStatus } from '@/lib/types';
import { StockEditor } from './StockEditor';

const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<DashboardStats>('/admin/stats')
      .then((s) => {
        setStats(s);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
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

  const maxRevenue = Math.max(1, ...stats.revenueLast7Days.map((d) => Number(d.revenue)));

  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-head">
            Doanh thu (đã thanh toán)
            <span className="kpi-ico ico-orange">
              <FontAwesomeIcon icon={faCoins} />
            </span>
          </div>
          <strong>{formatPrice(stats.revenue)}</strong>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            Tổng đơn hàng
            <span className="kpi-ico ico-blue">
              <FontAwesomeIcon icon={faReceipt} />
            </span>
          </div>
          <strong>{stats.totalOrders}</strong>
          <span className="small warn">{stats.ordersByStatus.PENDING} đơn chờ xác nhận</span>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            Khách hàng
            <span className="kpi-ico ico-green">
              <FontAwesomeIcon icon={faUsers} />
            </span>
          </div>
          <strong>{stats.customers}</strong>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            Sản phẩm
            <span className="kpi-ico ico-violet">
              <FontAwesomeIcon icon={faBoxesStacked} />
            </span>
          </div>
          <strong>{stats.products}</strong>
          <span className="small danger">{stats.lowStock.length} sắp hết hàng</span>
        </div>
      </div>

      <div className="admin-grid">
        <section className="panel">
          <h2 className="panel-title">
            <span className="fa-icon-wrap">
              <FontAwesomeIcon icon={faChartColumn} />
            </span>
            Doanh thu 7 ngày
          </h2>
          <div className="bars" role="img" aria-label="Biểu đồ doanh thu 7 ngày gần nhất">
            {stats.revenueLast7Days.map((d) => (
              <div className="bar" key={d.day} title={`${d.day}: ${formatPrice(d.revenue)} · ${d.orders} đơn`}>
                <span className="bar-value">{Number(d.revenue) > 0 ? compact.format(Number(d.revenue)) : ''}</span>
                <span className="bar-fill" style={{ height: `${Math.max(2, (Number(d.revenue) / maxRevenue) * 100)}%` }} />
                <span className="bar-label">
                  {d.day.slice(8)}/{d.day.slice(5, 7)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">
            <span className="fa-icon-wrap">
              <FontAwesomeIcon icon={faChartPie} />
            </span>
            Đơn theo trạng thái
          </h2>
          <ul className="status-list">
            {(Object.keys(stats.ordersByStatus) as OrderStatus[]).map((s) => (
              <li key={s}>
                <span className={`badge status-${s.toLowerCase()}`}>
                  <FontAwesomeIcon icon={STATUS_ICON[s]} /> {STATUS_LABEL[s]}
                </span>
                <strong>{stats.ordersByStatus[s]}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2 className="panel-title">
            <span className="fa-icon-wrap">
              <FontAwesomeIcon icon={faRankingStar} />
            </span>
            Bán chạy nhất
          </h2>
          {stats.topProducts.length === 0 ? (
            <p className="muted">Chưa có dữ liệu bán hàng.</p>
          ) : (
            <ol className="top-list">
              {stats.topProducts.map((p) => (
                <li key={p.productId}>
                  <Link className="link" href={`/products/${p.slug}`}>
                    {p.name}
                  </Link>
                  <span className="muted small">{p.quantity} đã bán</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">
            <span className="fa-icon-wrap">
              <FontAwesomeIcon icon={faWarehouse} />
            </span>
            Sắp hết hàng (≤ 10)
          </h2>
          {stats.lowStock.length === 0 ? (
            <p className="muted">Tồn kho ổn định.</p>
          ) : (
            <ul className="low-stock">
              {stats.lowStock.map((p) => (
                <li key={p.id}>
                  <span className="truncate">{p.name}</span>
                  <StockEditor key={`${p.id}-${p.stock}`} productId={p.id} stock={p.stock} onSaved={load} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="muted small">
        <FontAwesomeIcon icon={faRotate} /> Cập nhật lúc {formatDate(stats.generatedAt)} · tự làm mới mỗi 30 giây
      </p>
    </div>
  );
}
