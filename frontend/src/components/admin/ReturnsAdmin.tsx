'use client';

import { faCheck, faRotateLeft, faRotateRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime } from '@/lib/admin';
import { apiFetch } from '@/lib/client-api';
import { PAYMENT_METHOD_LABEL, formatPrice, shortId, type PaymentMethod } from '@/lib/types';
import { ConfirmButton, Loading, Notice } from './ui';

interface AdminReturn {
  id: string;
  orderId: string;
  reason: string;
  description: string;
  images: string[];
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  refundAmount: number;
  adminNote: string | null;
  createdAt: string;
  order: { paymentMethod: PaymentMethod; paymentStatus: string };
  user: { email: string; fullName: string; phone: string | null };
}

interface AdminRefund {
  id: string;
  orderId: string;
  amount: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'MANUAL_REQUIRED';
  reason: string;
  lastError: string | null;
  attempts: number;
  createdAt: string;
  payment: { method: PaymentMethod; txnRef: string } | null;
  order: { user: { email: string; fullName: string } };
}

const RETURN_TABS = [
  { id: 'REQUESTED', label: 'Chờ duyệt' },
  { id: 'APPROVED', label: 'Đã duyệt' },
  { id: 'REJECTED', label: 'Đã từ chối' },
] as const;

/** Trả hàng / hoàn tiền: duyệt yêu cầu của khách + xử lý lệnh hoàn lỗi hoặc cần hoàn tay */
export function ReturnsAdmin() {
  const [status, setStatus] = useState<AdminReturn['status']>('REQUESTED');
  const [returns, setReturns] = useState<AdminReturn[] | null>(null);
  const [refunds, setRefunds] = useState<AdminRefund[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<AdminReturn[]>(`/admin/returns?status=${status}`)
      .then(setReturns)
      .catch((err: Error) => setMsg({ ok: false, text: err.message }));
    Promise.all([apiFetch<AdminRefund[]>('/admin/refunds?status=MANUAL_REQUIRED'), apiFetch<AdminRefund[]>('/admin/refunds?status=FAILED')])
      .then(([a, b]) => setRefunds([...a, ...b]))
      .catch(() => setRefunds([]));
  }, [status]);
  useEffect(load, [load]);

  async function act(path: string, body: unknown, ok: string) {
    setMsg(null);
    try {
      await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
      setMsg({ ok: true, text: ok });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      load();
    }
  }

  return (
    <div className="stack">
      <Notice message={msg} onClose={() => setMsg(null)} />

      {refunds.length > 0 && (
        <div className="panel">
          <h2 className="panel-title">Lệnh hoàn tiền cần xử lý ({refunds.length})</h2>
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Đơn</th>
                <th>Khách</th>
                <th>Phương thức</th>
                <th className="num">Số tiền</th>
                <th>Tình trạng</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id}>
                  <td>#{shortId(r.orderId)}</td>
                  <td className="small">
                    {r.order.user.fullName}
                    <div className="muted">{r.order.user.email}</div>
                  </td>
                  <td>{r.payment ? PAYMENT_METHOD_LABEL[r.payment.method] : 'COD'}</td>
                  <td className="num price">{formatPrice(r.amount)}</td>
                  <td className="small">
                    {r.status === 'FAILED' ? `Lỗi (${r.attempts} lần): ${r.lastError ?? ''}` : 'Cần chuyển khoản hoàn tay'}
                  </td>
                  <td className="actions">
                    {r.status === 'FAILED' && (
                      <button className="btn btn-sm" onClick={() => act(`/admin/refunds/${r.id}/retry`, {}, 'Đã gửi lại lệnh hoàn')}>
                        <FontAwesomeIcon icon={faRotateRight} /> Thử lại
                      </button>
                    )}
                    <ConfirmButton
                      label="Đã hoàn tay"
                      confirmLabel="Đã chuyển tiền cho khách?"
                      icon={faCheck}
                      onConfirm={() => act(`/admin/refunds/${r.id}/complete`, { note: 'Đã chuyển khoản hoàn tiền' }, 'Đã đánh dấu hoàn tiền')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="order-tabs" role="tablist">
        {RETURN_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={status === t.id} className={status === t.id ? 'active' : undefined} onClick={() => setStatus(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {!returns ? (
        <Loading />
      ) : returns.length === 0 ? (
        <EmptyState icon={faRotateLeft} title="Không có yêu cầu nào">
          <p>Yêu cầu trả hàng/hoàn tiền của khách sẽ xuất hiện ở đây.</p>
        </EmptyState>
      ) : (
        <ul className="return-list">
          {returns.map((r) => (
            <li key={r.id} className="panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>
                  Đơn #{shortId(r.orderId)} · {formatPrice(r.refundAmount)}
                </strong>
                <span className="muted small">{formatDateTime(r.createdAt)}</span>
              </div>
              <p className="small" style={{ margin: '4px 0' }}>
                {r.user.fullName} · {r.user.email}
                {r.user.phone && ` · ${r.user.phone}`} · {PAYMENT_METHOD_LABEL[r.order.paymentMethod]}
              </p>
              <p style={{ margin: '4px 0' }}>
                <b>{r.reason}</b> — {r.description}
              </p>
              {r.images.length > 0 && (
                <div className="return-images">
                  {r.images.map((src) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="Ảnh minh chứng" width={96} height={96} />
                    </a>
                  ))}
                </div>
              )}
              {r.adminNote && <p className="muted small">Ghi chú: {r.adminNote}</p>}
              {r.status === 'REQUESTED' && (
                <div className="row">
                  <input
                    className="input"
                    placeholder="Ghi chú / lý do từ chối"
                    maxLength={500}
                    value={notes[r.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                  <button className="btn btn-sm" onClick={() => act(`/admin/returns/${r.id}/approve`, { note: notes[r.id] || undefined }, 'Đã duyệt, hoàn kho và tạo lệnh hoàn tiền')}>
                    <FontAwesomeIcon icon={faCheck} /> Duyệt
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => act(`/admin/returns/${r.id}/reject`, { note: notes[r.id] }, 'Đã từ chối yêu cầu')}>
                    <FontAwesomeIcon icon={faXmark} /> Từ chối
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
