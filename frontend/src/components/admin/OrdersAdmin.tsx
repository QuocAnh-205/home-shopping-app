'use client';

import { faEnvelope, faFileCsv, faInbox, faLocationDot, faMagnifyingGlass, faPhone, faRotateLeft, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { STATUS_ICON, StatusBadge } from '@/components/StatusBadge';
import { downloadCsv, formatDateTime, toQuery, type AdminOrderPage } from '@/lib/admin';
import { apiFetch } from '@/lib/client-api';
import {
  NEXT_STATUSES,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  STATUS_LABEL,
  formatPrice,
  shortId,
  type AdminOrder,
  type OrderStatus,
} from '@/lib/types';
import { OrderPaymentsAdmin } from './OrderPaymentsAdmin';
import { Loading, Notice, Pager, useDebounced } from './ui';

const FILTERS: (OrderStatus | '')[] = [
  '',
  'AWAITING_PAYMENT',
  'PENDING',
  'PROCESSING',
  'SHIPPING',
  'DELIVERED',
  'COMPLETED',
  'RETURN_REQUESTED',
  'RETURNED',
  'CANCELLED',
];
const ACTION_LABEL: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: '',
  PENDING: '',
  PROCESSING: 'Xác nhận đơn',
  SHIPPING: 'Giao cho vận chuyển',
  DELIVERED: 'Đã giao',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Hủy',
  RETURN_REQUESTED: '',
  RETURNED: '',
};

export function OrdersAdmin({ initialQuery = '' }: { initialQuery?: string }) {
  const [status, setStatus] = useState<OrderStatus | ''>(initialQuery ? '' : 'PENDING');
  const [q, setQ] = useState(initialQuery);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminOrderPage | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const dq = useDebounced(q);
  const query = toQuery({ status, q: dq.trim(), from, to });

  const load = useCallback(() => {
    apiFetch<AdminOrderPage>(`/admin/orders?${query}&page=${page}&limit=15`)
      .then(setData)
      .catch((err: Error) => setMessage({ ok: false, text: err.message }));
  }, [query, page]);

  useEffect(load, [load]);
  useEffect(() => setPage(1), [query]);
  useEffect(() => {
    setQ(initialQuery);
    if (initialQuery) setStatus('');
  }, [initialQuery]);

  async function transition(order: AdminOrder, next: OrderStatus) {
    // Hủy đơn cần bấm 2 lần (hoàn kho là thao tác không đảo ngược được)
    if (next === 'CANCELLED' && confirmCancel !== order.id) {
      setConfirmCancel(order.id);
      return;
    }
    setConfirmCancel(null);
    setBusy(order.id);
    setMessage(null);
    try {
      await apiFetch(`/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, ...(next === 'CANCELLED' ? { note: 'Cửa hàng hủy đơn' } : {}) }),
      });
      setMessage({ ok: true, text: `Đơn #${shortId(order.id)} → ${STATUS_LABEL[next]}` });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
      load();
    }
  }

  const filtered = Boolean(q || from || to);
  return (
    <div className="stack">
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f || 'all'} className={status === f ? 'chip active' : 'chip'} onClick={() => setStatus(f)}>
            {f && <FontAwesomeIcon icon={STATUS_ICON[f]} />}
            {f ? STATUS_LABEL[f] : 'Tất cả'}
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="admin-toolbar">
          <span className="input-wrap grow">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input className="input input-sm" type="search" placeholder="Mã đơn, tên người nhận / tài khoản, email, SĐT, địa chỉ…" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
          <label className="small date-field">
            Từ <input className="input input-sm" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="small date-field">
            Đến <input className="input input-sm" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          {filtered && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setFrom(''); setTo(''); }}>
              <FontAwesomeIcon icon={faRotateLeft} /> Xóa lọc
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => downloadCsv(`/admin/orders/export?${query}`, 'don-hang.csv').catch((e: Error) => setMessage({ ok: false, text: e.message }))}>
            <FontAwesomeIcon icon={faFileCsv} /> Xuất CSV
          </button>
        </div>
        {data && (
          <p className="muted small admin-summary">
            {data.summary.count} đơn phù hợp · tổng giá trị <b className="price">{formatPrice(data.summary.amount)}</b>
          </p>
        )}
        <Notice message={message} onClose={() => setMessage(null)} />
        {!data ? (
          <Loading label="Đang tải đơn hàng…" />
        ) : data.items.length === 0 ? (
          <EmptyState icon={faInbox} title="Không có đơn hàng">
            <p>Không có đơn nào khớp bộ lọc hiện tại.</p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Người nhận / tài khoản</th>
                  <th>Ngày đặt</th>
                  <th className="num">SL</th>
                  <th className="num">Tổng</th>
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
                        {o.recipientName && o.recipientName !== o.user.fullName ? (
                          <>
                            {o.recipientName}
                            <div className="muted small">Tài khoản: {o.user.fullName}</div>
                          </>
                        ) : (
                          o.recipientName ?? o.user.fullName
                        )}
                        <div className="muted small">
                          {o.phone} · {o.user.email}
                        </div>
                      </td>
                      <td className="small">{formatDateTime(o.createdAt)}</td>
                      <td className="num">{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                      <td className="num price">{formatPrice(o.totalAmount)}</td>
                      <td>
                        <StatusBadge status={o.status} />
                        {o.status === 'AWAITING_PAYMENT' && o.transferClaimedAt && (
                          <div className="badge badge-ok" title="Khách báo đã chuyển khoản – đối soát sao kê rồi bấm Xác nhận đã nhận tiền">
                            Khách báo đã CK
                          </div>
                        )}
                      </td>
                      <td className="actions">
                        {NEXT_STATUSES[o.status].map((next) => (
                          <button
                            key={next}
                            className={next === 'CANCELLED' ? 'btn btn-ghost btn-sm' : 'btn btn-sm'}
                            disabled={busy === o.id}
                            onClick={() => transition(o, next)}
                          >
                            <FontAwesomeIcon icon={STATUS_ICON[next]} />
                            {next === 'CANCELLED' && confirmCancel === o.id ? 'Chắc chắn hủy?' : ACTION_LABEL[next]}
                          </button>
                        ))}
                        {NEXT_STATUSES[o.status].length === 0 && <span className="muted small">—</span>}
                      </td>
                    </tr>
                    {expanded === o.id && (
                      <tr className="detail-row">
                        <td colSpan={7}>
                          <div className="order-detail">
                            <div className="stack" style={{ gap: 4 }}>
                              <span>
                                <FontAwesomeIcon icon={faUser} /> Tài khoản: {o.user.fullName} · <FontAwesomeIcon icon={faEnvelope} /> {o.user.email}
                                {o.user.phone && ` · ${o.user.phone}`}
                              </span>
                              <span>
                                <FontAwesomeIcon icon={faLocationDot} /> {o.shippingAddress}
                                {o.latitude != null && o.longitude != null && (
                                  <>
                                    {' · '}
                                    <a className="link" href={`https://www.google.com/maps?q=${o.latitude},${o.longitude}`} target="_blank" rel="noreferrer">
                                      Xem bản đồ
                                    </a>
                                  </>
                                )}
                              </span>
                              <span>
                                <FontAwesomeIcon icon={faPhone} /> Người nhận: {o.recipientName ? `${o.recipientName} · ` : ''}
                                {o.phone}
                              </span>
                              <span className="muted small">
                                Mã đầy đủ: {o.id} · Cập nhật lần cuối {formatDateTime(o.updatedAt)}
                              </span>
                              <span className="small">
                                {PAYMENT_METHOD_LABEL[o.paymentMethod]} · {PAYMENT_STATUS_LABEL[o.paymentStatus]}
                                {o.shippingFee > 0 && ` · Ship ${formatPrice(o.shippingFee)}`}
                                {o.discountAmount + o.shippingDiscount > 0 && ` · Giảm ${formatPrice(o.discountAmount + o.shippingDiscount)}`}
                                {o.voucherCode && ` (${[o.voucherCode, o.shippingVoucherCode].filter(Boolean).join(', ')})`}
                              </span>
                              {o.note && <span className="small">Lời nhắn: {o.note}</span>}
                              {o.paymentMethod !== 'COD' && <OrderPaymentsAdmin orderId={o.id} onChanged={load} />}
                            </div>
                            <table className="table table-compact">
                              <thead>
                                <tr>
                                  <th>Sản phẩm</th>
                                  <th className="num">Đơn giá</th>
                                  <th className="num">SL</th>
                                  <th className="num">Thành tiền</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.items.map((i) => (
                                  <tr key={i.id}>
                                    <td>
                                      <a className="link" href={`/products/${i.productSlug}`} target="_blank" rel="noreferrer">
                                        {i.productName}
                                      </a>
                                    </td>
                                    <td className="num">{formatPrice(i.unitPrice)}</td>
                                    <td className="num">{i.quantity}</td>
                                    <td className="num">{formatPrice(Number(i.unitPrice) * i.quantity)}</td>
                                  </tr>
                                ))}
                                <tr>
                                  <td colSpan={3} className="num">
                                    <b>Tổng cộng</b>
                                  </td>
                                  <td className="num price">
                                    <b>{formatPrice(o.totalAmount)}</b>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} totalPages={data.totalPages} total={data.total} unit="đơn" onPage={setPage} />}
      </div>
    </div>
  );
}
