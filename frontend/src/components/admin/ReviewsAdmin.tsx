'use client';

import { faCircleCheck, faComments, faMagnifyingGlass, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Stars } from '@/components/Stars';
import { formatDateTime, toQuery } from '@/lib/admin';
import { apiFetch } from '@/lib/client-api';
import type { AdminReview, Page } from '@/lib/types';
import { ConfirmButton, Loading, Notice, Pager, useDebounced } from './ui';

type Row = AdminReview & { userEmail?: string };

/** Kiểm duyệt đánh giá: tìm, lọc theo số sao / đã mua, gỡ nội dung vi phạm */
export function ReviewsAdmin() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [rating, setRating] = useState('');
  const [verified, setVerified] = useState('');
  const [data, setData] = useState<Page<Row> | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dq = useDebounced(q);
  const query = toQuery({ q: dq.trim(), rating, verified });

  const load = useCallback(() => {
    apiFetch<Page<Row>>(`/admin/reviews?${query}&page=${page}&limit=15`)
      .then(setData)
      .catch((err: Error) => setMessage({ ok: false, text: err.message }));
  }, [query, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [query]);

  return (
    <div className="stack">
      <div className="panel">
        <div className="admin-toolbar">
          <span className="input-wrap grow">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input className="input input-sm" type="search" placeholder="Nội dung, tên sản phẩm, tên/email khách…" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
          <select className="input input-sm" value={rating} onChange={(e) => setRating(e.target.value)} aria-label="Số sao">
            <option value="">Mọi số sao</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r} sao
              </option>
            ))}
          </select>
          <select className="input input-sm" value={verified} onChange={(e) => setVerified(e.target.value)} aria-label="Đã mua">
            <option value="">Tất cả</option>
            <option value="true">Đã mua hàng</option>
            <option value="false">Chưa mua</option>
          </select>
        </div>
        <Notice message={message} onClose={() => setMessage(null)} />
        {!data ? (
          <Loading label="Đang tải đánh giá…" />
        ) : data.items.length === 0 ? (
          <EmptyState icon={faComments} title="Không có đánh giá phù hợp" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Khách hàng</th>
                  <th>Đánh giá</th>
                  <th>Thời gian</th>
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
                      {r.userEmail && <div className="muted small">{r.userEmail}</div>}
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
                    <td className="small">{formatDateTime(r.createdAt)}</td>
                    <td>
                      <ConfirmButton
                        label="Gỡ"
                        confirmLabel="Chắc chắn gỡ?"
                        icon={faTrashCan}
                        onConfirm={async () => {
                          try {
                            await apiFetch(`/admin/reviews/${r.id}`, { method: 'DELETE' });
                            setMessage({ ok: true, text: 'Đã gỡ đánh giá, điểm trung bình sản phẩm được tính lại.' });
                            load();
                          } catch (err) {
                            setMessage({ ok: false, text: (err as Error).message });
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} totalPages={data.totalPages} total={data.total} unit="đánh giá" onPage={setPage} />}
      </div>
    </div>
  );
}
