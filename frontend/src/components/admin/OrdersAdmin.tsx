'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { apiFetch } from '@/lib/client-api';
import {
  NEXT_STATUSES,
  STATUS_LABEL,
  formatDate,
  formatPrice,
  shortId,
  type AdminOrder,
  type OrderStatus,
  type Page,
} from '@/lib/types';

const FILTERS: (OrderStatus | '')[] = ['', 'PENDING', 'PAID', 'SHIPPING', 'COMPLETED', 'CANCELLED'];
const ACTION_LABEL: Record<OrderStatus, string> = {
  PENDING: '',
  PAID: 'Xác nhận thanh toán',
  SHIPPING: 'Giao hàng',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Hủy',
};

export function OrdersAdmin() {
  const [status, setStatus] = useState<OrderStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AdminOrder> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), limit: '15' });
    if (status) qs.set('status', status);
    apiFetch<Page<AdminOrder>>(`/admin/orders?${qs}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [page, status]);

  useEffect(load, [load]);

  async function transition(order: AdminOrder, next: OrderStatus) {
    // Hủy đơn cần bấm 2 lần (hoàn kho là thao tác không đảo ngược được)
    if (next === 'CANCELLED' && confirmCancel !== order.id) {
      setConfirmCancel(order.id);
      return;
    }
    setConfirmCancel(null);
    setBusy(order.id);
    setError(null);
    try {
      await apiFetch(`/admin/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      load();
    } catch (err) {
      setError((err as Error).message);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            className={status === f ? 'chip active' : 'chip'}
            onClick={() => {
              setStatus(f);
              setPage(1);
            }}
          >
            {f ? STATUS_LABEL[f] : 'Tất cả'}
          </button>
        ))}
      </div>
      {error && <p className="alert">{error}</p>}
      {!data ? (
        <div className="skeleton">Đang tải đơn hàng…</div>
      ) : data.items.length === 0 ? (
        <p className="muted">Không có đơn hàng.</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Khách hàng</th>
                <th>Ngày đặt</th>
                <th>Tổng</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <Fragment key={o.id}>
                  <tr>
                    <td>
                      <button className="link-btn" onClick={() => setExpanded(expanded === o.id ? null : o.id)} aria-expanded={expanded === o.id}>
                        #{shortId(o.id)}
                      </button>
                    </td>
                    <td>
                      {o.user.fullName}
                      <div className="muted small">{o.user.email}</div>
                    </td>
                    <td>{formatDate(o.createdAt)}</td>
                    <td className="price">{formatPrice(o.totalAmount)}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="actions">
                      {NEXT_STATUSES[o.status].map((next) => (
                        <button
                          key={next}
                          className={next === 'CANCELLED' ? 'btn btn-ghost btn-sm' : 'btn btn-sm'}
                          disabled={busy === o.id}
                          onClick={() => transition(o, next)}
                        >
                          {next === 'CANCELLED' && confirmCancel === o.id ? 'Chắc chắn hủy?' : ACTION_LABEL[next]}
                        </button>
                      ))}
                    </td>
                  </tr>
                  {expanded === o.id && (
                    <tr className="detail-row">
                      <td colSpan={6}>
                        <strong>Giao tới:</strong> {o.shippingAddress} · ☎ {o.phone}
                        <ul>
                          {o.items.map((i) => (
                            <li key={i.id}>
                              {i.product.name} × {i.quantity} — {formatPrice(i.unitPrice)}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.totalPages > 1 && (
        <nav className="pagination">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Trước
          </button>
          <span className="muted">
            Trang {data.page}/{data.totalPages} · {data.total} đơn
          </span>
          <button className="btn btn-ghost" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Sau →
          </button>
        </nav>
      )}
    </div>
  );
}
