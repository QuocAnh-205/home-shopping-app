'use client';

import { faClock, faCreditCard, faQrcode, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import { PAYMENT_METHOD_LABEL, formatPrice, type Order, type PaymentInfo, type PaymentMethod } from '@/lib/types';

interface MethodOption {
  method: PaymentMethod;
  label: string;
  available: boolean;
}

function useCountdown(until: string | null): number {
  const [left, setLeft] = useState(() => (until ? new Date(until).getTime() - Date.now() : 0));
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setLeft(new Date(until).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return Math.max(0, left);
}

/** Khối "Chờ thanh toán" trên trang đơn: đếm ngược giữ hàng, thanh toán lại, đổi phương thức, mã VietQR */
export function PaymentPanel({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const left = useCountdown(order.paymentExpiresAt);
  const [methods, setMethods] = useState<MethodOption[]>([]);
  const [method, setMethod] = useState<PaymentMethod>(order.paymentMethod);
  const [qr, setQr] = useState<PaymentInfo['qr']>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MethodOption[]>('/payments/methods')
      .then(setMethods)
      .catch(() => setMethods([]));
  }, []);

  // Hết giờ giữ hàng → tải lại đơn (job nền sẽ hủy đơn)
  useEffect(() => {
    if (order.paymentExpiresAt && left === 0) {
      const t = setTimeout(onChanged, 5000);
      return () => clearTimeout(t);
    }
  }, [left, order.paymentExpiresAt, onChanged]);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const payment = await apiFetch<PaymentInfo | null>(`/orders/${order.id}/payments`, { method: 'POST', body: JSON.stringify({ method }) });
      if (!payment) {
        onChanged(); // đã đổi sang COD
        return;
      }
      if (payment.payUrl) {
        window.location.assign(payment.payUrl);
        return;
      }
      setQr(payment.qr);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const mm = String(Math.floor(left / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');

  return (
    <div className="panel payment-panel">
      <h2 className="panel-title">
        <FontAwesomeIcon icon={faCreditCard} /> Chờ thanh toán · {formatPrice(order.totalAmount)}
      </h2>
      <p className="payment-countdown">
        <FontAwesomeIcon icon={faClock} /> Đơn được giữ trong <strong>{mm}:{ss}</strong>. Quá hạn đơn sẽ tự hủy và sản phẩm được trả về kho.
      </p>
      <div className="row">
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} aria-label="Phương thức thanh toán">
          {(methods.length ? methods : [{ method: order.paymentMethod, label: PAYMENT_METHOD_LABEL[order.paymentMethod], available: true }]).map((m) => (
            <option key={m.method} value={m.method} disabled={!m.available}>
              {m.label}
              {!m.available ? ' (chưa hỗ trợ)' : ''}
            </option>
          ))}
        </select>
        <button className="btn" disabled={busy || left === 0} onClick={pay}>
          {busy && <FontAwesomeIcon icon={faSpinner} spin />} {method === 'COD' ? 'Đổi sang COD' : 'Thanh toán ngay'}
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
      )}
      {qr && (
        <div className="vietqr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.imageUrl} alt={`Mã VietQR chuyển ${formatPrice(qr.amount)}`} width={280} height={280} />
          <dl className="summary">
            <dt>Chủ tài khoản</dt>
            <dd>{qr.accountName}</dd>
            <dt>Số tài khoản</dt>
            <dd>{qr.accountNo}</dd>
            <dt>Số tiền</dt>
            <dd className="price">{formatPrice(qr.amount)}</dd>
            <dt>Nội dung (bắt buộc)</dt>
            <dd>
              <code>{qr.content}</code>
            </dd>
          </dl>
          <p className="muted small">
            <FontAwesomeIcon icon={faQrcode} /> Quét mã bằng ứng dụng ngân hàng. Cửa hàng xác nhận sau khi đối soát (thường trong vài phút giờ hành chính).
          </p>
        </div>
      )}
    </div>
  );
}
