'use client';

import { faChevronLeft, faChevronRight, faCircleCheck, faSpinner, faTrashCan, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Stars } from '@/components/Stars';
import { apiFetch } from '@/lib/client-api';
import { formatDate, type AdminReview, type Page } from '@/lib/types';

/** Kiểm duyệt đánh giá: xem đánh giá mới nhất và gỡ nội dung vi phạm */
export function ReviewsAdmin() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AdminReview> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<Page<AdminReview>>(`/admin/reviews?page=${page}&limit=15`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [page]);
  useEffect(load, [load]);

  async function remove(id: string) {
    if (confirm !== id) {
      setConfirm(id);
      return;
    }
    setBusy(id);
    try {
      await apiFetch(`/admin/reviews/${id}`, { method: 'DELETE' });
      setConfirm(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return error ? (
      <p className="alert">{error}</p>
    ) : (
      <div className="skeleton">
        <FontAwesomeIcon icon={faSpinner} spin /> Đang tải đánh giá…
      </div>
    );
  }

  return (
    <div className="stack">
      {error && (
        <p className="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
      )}
      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Khách hàng</th>
              <th>Đánh giá</th>
              <th>Ngày</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link className="link" href={`/products/${r.product.slug}#reviews`} target="_blank">
                    {r.product.name}
                  </Link>
                </td>
                <td>
                  {r.user.fullName}
                  {r.verifiedPurchase && (
                    <div className="small ok">
                      <FontAwesomeIcon icon={faCircleCheck} /> Đã mua
                    </div>
                  )}
                </td>
                <td style={{ maxWidth: 420 }}>
                  <Stars value={r.rating} />
                  <div className="small">{r.comment}</div>
                </td>
                <td className="small">{formatDate(r.createdAt)}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => remove(r.id)}>
                    <FontAwesomeIcon icon={faTrashCan} /> {confirm === r.id ? 'Chắc chắn gỡ?' : 'Gỡ'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.totalPages > 1 && (
        <nav className="pagination">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <FontAwesomeIcon icon={faChevronLeft} /> Trước
          </button>
          <span className="muted">
            Trang {data.page}/{data.totalPages} · {data.total} đánh giá
          </span>
          <button className="btn btn-ghost" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Sau <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </nav>
      )}
    </div>
  );
}
