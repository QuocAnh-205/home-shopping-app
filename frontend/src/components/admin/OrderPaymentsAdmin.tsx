'use client';

import { faCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/admin';
import { apiFetch } from '@/lib/client-api';
import { PAYMENT_METHOD_LABEL, formatPrice, type PaymentMethod } from '@/lib/types';
import { ConfirmButton, Notice } from './ui';

interface AdminPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  status: string;
  txnRef: string;
  gatewayTxnId: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
  events: { kind: string; result: string; signatureValid: boolean; createdAt: string }[];
  refunds: { id: string; status: string; amount: number; lastError: string | null }[];
}

const STATUS_VI: Record<string, string> = {
  PENDING: 'Chờ thanh toán',
  SUCCEEDED: 'Thành công',
  FAILED: 'Thất bại',
  EXPIRED: 'Hết hạn',
  CANCELLED: 'Đã đóng',
  MANUAL_REQUIRED: 'Chờ hoàn tay',
};

/** Các lần thử thanh toán của 1 đơn (trong dòng mở rộng của bảng Đơn hàng) + xác nhận chuyển khoản VietQR */
export function OrderPaymentsAdmin({ orderId, onChanged }: { orderId: string; onChanged: () => void }) {
  const [rows, setRows] = useState<AdminPayment[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<AdminPayment[]>(`/admin/orders/${orderId}/payments`)
      .then(setRows)
      .catch((err: Error) => setMsg({ ok: false, text: err.message }));
  }, [orderId]);
  useEffect(load, [load]);

  async function confirm(p: AdminPayment) {
    try {
      await apiFetch(`/admin/payments/${p.id}/confirm`, { method: 'POST', body: JSON.stringify({ note: 'Đã đối soát sao kê' }) });
      setMsg({ ok: true, text: `Đã xác nhận nhận ${formatPrice(p.amount)}` });
      load();
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  if (!rows || rows.length === 0) return msg ? <Notice message={msg} /> : null;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <strong className="small">Thanh toán online</strong>
      <Notice message={msg} onClose={() => setMsg(null)} />
      <table className="table table-compact">
        <thead>
          <tr>
            <th>Lúc tạo</th>
            <th>Cổng</th>
            <th>Mã giao dịch</th>
            <th className="num">Số tiền</th>
            <th>Trạng thái</th>
            <th>IPN gần nhất</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="small">{formatDateTime(p.createdAt)}</td>
              <td>{PAYMENT_METHOD_LABEL[p.method]}</td>
              <td className="small">
                <code>{p.txnRef}</code>
                {p.gatewayTxnId && <div className="muted">{p.gatewayTxnId}</div>}
              </td>
              <td className="num">{formatPrice(p.amount)}</td>
              <td>
                {STATUS_VI[p.status] ?? p.status}
                {p.failureReason && <div className="muted small">{p.failureReason}</div>}
                {p.refunds.map((r) => (
                  <div key={r.id} className="small">
                    Hoàn {formatPrice(r.amount)}: {STATUS_VI[r.status] ?? r.status}
                  </div>
                ))}
              </td>
              <td className="small">{p.events[0] ? `${p.events[0].kind} · ${p.events[0].result}${p.events[0].signatureValid ? '' : ' (sai chữ ký)'}` : '—'}</td>
              <td>
                {p.status === 'PENDING' && (
                  <ConfirmButton label="Xác nhận đã nhận tiền" confirmLabel="Chắc chắn đã thấy tiền về?" icon={faCircleCheck} onConfirm={() => confirm(p)} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
