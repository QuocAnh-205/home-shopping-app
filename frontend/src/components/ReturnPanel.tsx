'use client';

import { faRotateLeft, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client-api';
import { formatDate, formatPrice, type Order } from '@/lib/types';

interface ReturnRequest {
  id: string;
  reason: string;
  description: string;
  images: string[];
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  refundAmount: number;
  adminNote: string | null;
  createdAt: string;
}

const STATUS_VI: Record<ReturnRequest['status'], string> = {
  REQUESTED: 'Đang chờ cửa hàng xem xét',
  APPROVED: 'Đã chấp nhận – tiền được hoàn về phương thức bạn đã thanh toán',
  REJECTED: 'Cửa hàng từ chối yêu cầu',
};

/** Phải khớp RETURN_WINDOW_DAYS ở backend (backend vẫn là nơi kiểm tra cuối cùng) */
const RETURN_WINDOW_DAYS = 15;
const MAX_FILES = 5;

/** Khối Trả hàng/Hoàn tiền trên trang đơn: xem yêu cầu đã gửi hoặc gửi yêu cầu mới (lý do + mô tả + ảnh) */
export function ReturnPanel({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [existing, setExisting] = useState<ReturnRequest | null | undefined>(undefined);
  const [reasons, setReasons] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ReturnRequest | null>(`/orders/${order.id}/return`)
      .then((r) => setExisting(r ?? null))
      .catch(() => setExisting(null));
  }, [order.id, order.status]);

  useEffect(() => {
    if (open && reasons.length === 0) apiFetch<string[]>('/returns/reasons').then(setReasons).catch(() => setReasons([]));
  }, [open, reasons.length]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const files = form.getAll('images').filter((f) => f instanceof File && f.size > 0);
    if (files.length > MAX_FILES) {
      setError(`Tối đa ${MAX_FILES} ảnh`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setExisting(await apiFetch<ReturnRequest>(`/orders/${order.id}/return`, { method: 'POST', body: form }));
      setOpen(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (existing === undefined) return null;
  if (existing) {
    return (
      <div className="panel">
        <h2 className="panel-title">
          <FontAwesomeIcon icon={faRotateLeft} /> Yêu cầu trả hàng/hoàn tiền
        </h2>
        <p style={{ margin: 0 }}>
          <b>{STATUS_VI[existing.status]}</b>
        </p>
        <p className="muted small">
          Gửi lúc {formatDate(existing.createdAt)} · {existing.reason} · Hoàn {formatPrice(existing.refundAmount)}
        </p>
        <p>{existing.description}</p>
        {existing.adminNote && <p className="small">Phản hồi của cửa hàng: {existing.adminNote}</p>}
        {existing.images.length > 0 && (
          <div className="return-images">
            {existing.images.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="Ảnh minh chứng" width={96} height={96} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const deadline = order.deliveredAt ? new Date(order.deliveredAt).getTime() + RETURN_WINDOW_DAYS * 86_400_000 : 0;
  if (!['DELIVERED', 'COMPLETED'].includes(order.status) || Date.now() > deadline) return null;

  return (
    <div className="panel">
      {!open ? (
        <button className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>
          <FontAwesomeIcon icon={faRotateLeft} /> Trả hàng/Hoàn tiền (còn hạn đến {formatDate(new Date(deadline).toISOString())})
        </button>
      ) : (
        <form className="form" onSubmit={submit}>
          <h2 className="panel-title">
            <FontAwesomeIcon icon={faRotateLeft} /> Yêu cầu trả hàng/hoàn tiền
          </h2>
          <label className="field">
            Lý do
            <select className="input" name="reason" required defaultValue="">
              <option value="" disabled>
                — Chọn lý do —
              </option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Mô tả chi tiết
            <textarea className="input" name="description" rows={3} minLength={10} maxLength={1000} required placeholder="Mô tả tình trạng sản phẩm bạn nhận được" />
          </label>
          <label className="field">
            Ảnh minh chứng (tối đa {MAX_FILES} ảnh, mỗi ảnh ≤ 2 MB)
            <input className="input" type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple />
          </label>
          {error && (
            <p className="alert" role="alert">
              <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
            </p>
          )}
          <div className="row">
            <button className="btn" disabled={busy}>
              {busy && <FontAwesomeIcon icon={faSpinner} spin />} Gửi yêu cầu
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Hủy
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
