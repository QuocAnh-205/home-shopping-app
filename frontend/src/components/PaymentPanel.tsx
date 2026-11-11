'use client';

import { faCircleCheck, faClock, faCopy, faCreditCard, faQrcode, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import { PAYMENT_METHOD_LABEL, formatDate, formatPrice, type Order, type PaymentInfo, type PaymentMethod } from '@/lib/types';

interface MethodOption {
  method: PaymentMethod;
  label: string;
  available: boolean;
}

/** Hướng dẫn quét mã theo app khách chọn (mã VietQR chuẩn Napas 247 – app nào ở Việt Nam cũng quét được) */
const STEPS: Record<PaymentMethod, string[]> = {
  MOMO: ['Mở ứng dụng MoMo → bấm "Quét mã".', 'Quét mã QR bên cạnh (hoặc chọn ảnh mã đã lưu).', 'Kiểm tra số tiền & nội dung rồi xác nhận chuyển.'],
  VNPAY: ['Mở app ngân hàng bất kỳ có VNPay-QR / quét QR (Vietcombank, BIDV, MB, Techcombank…).', 'Quét mã QR bên cạnh.', 'Giữ nguyên số tiền & nội dung, xác nhận chuyển.'],
  VIETQR: ['Mở app ngân hàng / ví bất kỳ (MB, Vietcombank, ZaloPay, MoMo…) → "Quét QR".', 'Quét mã bên cạnh hoặc chuyển tay theo thông tin dưới đây.', 'Ghi ĐÚNG nội dung chuyển khoản để cửa hàng đối soát.'],
  COD: [],
};

function useCountdown(until: string | null): number {
  const [left, setLeft] = useState(() => (until ? new Date(until).getTime() - Date.now() : 0));
  useEffect(() => {
    setLeft(until ? new Date(until).getTime() - Date.now() : 0);
    if (!until) return;
    const t = setInterval(() => setLeft(new Date(until).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return Math.max(0, left);
}

function CopyField({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <span className="muted small">{label}</span>
      <span className="copy-value">
        <b>{display ?? value}</b>
        <button
          type="button"
          className="btn-icon"
          aria-label={`Sao chép ${label.toLowerCase()}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* trình duyệt chặn clipboard */
            }
          }}
        >
          <FontAwesomeIcon icon={copied ? faCircleCheck : faCopy} />
        </button>
      </span>
    </div>
  );
}

/**
 * Khối "Chờ thanh toán" trên trang đơn:
 * - Chuyển khoản (VietQR / MoMo / VNPay-QR): tự hiện mã QR + thông tin tài khoản có nút sao chép + hướng dẫn theo app,
 *   nút "Tôi đã chuyển khoản" (giữ đơn thêm chờ cửa hàng đối soát); trang tự cập nhật khi cửa hàng xác nhận
 * - Cổng online có link (VNPay/MoMo merchant): nút "Thanh toán ngay"
 * - Đổi phương thức (kể cả sang COD) trước khi hết thời gian giữ hàng
 */
export function PaymentPanel({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const left = useCountdown(order.paymentExpiresAt);
  const [methods, setMethods] = useState<MethodOption[]>([]);
  const [method, setMethod] = useState<PaymentMethod>(order.paymentMethod);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claimed = Boolean(order.transferClaimedAt);

  const start = useCallback(
    async (m: PaymentMethod, redirect: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const p = await apiFetch<PaymentInfo | null>(`/orders/${order.id}/payments`, { method: 'POST', body: JSON.stringify({ method: m }) });
        if (!p) {
          onChanged(); // đã đổi sang COD
          return;
        }
        if (p.payUrl && redirect) {
          window.location.assign(p.payUrl);
          return;
        }
        setPayment(p);
        setChanging(false);
        if (m !== order.paymentMethod) onChanged();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [order.id, order.paymentMethod, onChanged],
  );

  // Mở trang là có ngay mã QR / link: lấy giao dịch đang mở, chưa có thì tạo
  useEffect(() => {
    apiFetch<MethodOption[]>('/payments/methods')
      .then(setMethods)
      .catch(() => setMethods([]));
    apiFetch<PaymentInfo[]>(`/orders/${order.id}/payments`)
      .then((list) => {
        const open = list.find((p) => p.status === 'PENDING' && p.method === order.paymentMethod);
        if (open) setPayment(open);
        else void start(order.paymentMethod, false);
      })
      .catch(() => undefined);
  }, [order.id, order.paymentMethod, start]);

  // Đang chờ cửa hàng xác nhận / chờ IPN: tự tải lại đơn mỗi 10 giây
  useEffect(() => {
    const t = setInterval(onChanged, 10_000);
    return () => clearInterval(t);
  }, [onChanged]);

  // Hết giờ giữ hàng → tải lại đơn (job nền sẽ hủy đơn)
  useEffect(() => {
    if (order.paymentExpiresAt && left === 0) {
      const t = setTimeout(onChanged, 5000);
      return () => clearTimeout(t);
    }
  }, [left, order.paymentExpiresAt, onChanged]);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/orders/${order.id}/payments/claim`, { method: 'POST' });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hh = Math.floor(left / 3_600_000);
  const mm = String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');
  const countdown = hh > 0 ? `${hh} giờ ${mm} phút` : `${mm}:${ss}`;
  const qr = payment?.status === 'PENDING' ? payment.qr : null;
  const options = methods.length ? methods : [{ method: order.paymentMethod, label: PAYMENT_METHOD_LABEL[order.paymentMethod], available: true }];

  return (
    <section className="panel payment-panel" aria-labelledby="pay-title">
      <h2 className="panel-title" id="pay-title">
        <FontAwesomeIcon icon={qr ? faQrcode : faCreditCard} /> Thanh toán {formatPrice(order.totalAmount)}
      </h2>

      {claimed ? (
        <p className="alert alert-ok" role="status">
          <FontAwesomeIcon icon={faCircleCheck} /> Bạn đã báo chuyển khoản lúc {formatDate(order.transferClaimedAt!)}. Cửa hàng sẽ xác nhận sau khi đối soát (đơn được
          giữ thêm {countdown}). Trang tự cập nhật khi tiền về.
        </p>
      ) : (
        <p className="payment-countdown">
          <FontAwesomeIcon icon={faClock} /> Đơn được giữ trong <strong>{countdown}</strong>. Quá hạn chưa thanh toán đơn sẽ tự hủy và sản phẩm trả về kho.
        </p>
      )}

      {qr ? (
        <div className="vietqr">
          <figure className="vietqr-code">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.imageUrl} alt={`Mã VietQR chuyển ${formatPrice(qr.amount)} tới ${qr.accountName}`} width={260} height={260} />
            <figcaption className="muted small">Quét bằng mọi app ngân hàng, MoMo, ZaloPay, VNPay-QR</figcaption>
          </figure>
          <div className="vietqr-info">
            <ol className="vietqr-steps">
              {STEPS[payment!.method].map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <CopyField label="Ngân hàng" value={qr.bankName} />
            <CopyField label="Số tài khoản" value={qr.accountNo} />
            <CopyField label="Chủ tài khoản" value={qr.accountName} />
            <CopyField label="Số tiền" value={String(qr.amount)} display={formatPrice(qr.amount)} />
            <CopyField label="Nội dung (bắt buộc)" value={qr.content} />
            {!claimed && (
              <button className="btn btn-block" disabled={busy} onClick={claim}>
                {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCircleCheck} />} Tôi đã chuyển khoản
              </button>
            )}
          </div>
        </div>
      ) : (
        payment?.payUrl && (
          <button className="btn" disabled={busy || left === 0} onClick={() => start(order.paymentMethod, true)}>
            {busy && <FontAwesomeIcon icon={faSpinner} spin />} Thanh toán ngay qua {PAYMENT_METHOD_LABEL[order.paymentMethod]}
          </button>
        )
      )}
      {!payment && busy && (
        <p className="muted">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tạo mã thanh toán…
        </p>
      )}

      {error && (
        <p className="alert" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
      )}

      {!claimed &&
        (changing ? (
          <div className="pay-change">
            <label className="field">
              Chọn phương thức khác
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {options.map((m) => (
                  <option key={m.method} value={m.method} disabled={!m.available}>
                    {m.label}
                    {!m.available ? ' (chưa hỗ trợ)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button className="btn btn-sm" disabled={busy || left === 0 || method === order.paymentMethod} onClick={() => start(method, true)}>
                {method === 'COD' ? 'Đổi sang thanh toán khi nhận hàng' : 'Đổi phương thức'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setChanging(false)}>
                Giữ nguyên
              </button>
            </div>
          </div>
        ) : (
          <button className="link-btn small" onClick={() => setChanging(true)}>
            Đổi phương thức thanh toán
          </button>
        ))}
    </section>
  );
}
