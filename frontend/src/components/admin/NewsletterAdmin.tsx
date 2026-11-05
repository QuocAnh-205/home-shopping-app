'use client';

import { faCalendarPlus, faEnvelopeOpenText, faFileCsv, faMagnifyingGlass, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { downloadCsv, formatDateTime, toQuery, type SubscriberPage } from '@/lib/admin';
import { apiFetch } from '@/lib/client-api';
import { ConfirmButton, Loading, Notice, Pager, StatTile, useDebounced } from './ui';

export function NewsletterAdmin() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SubscriberPage | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dq = useDebounced(q);
  const query = toQuery({ q: dq.trim() });

  const load = useCallback(() => {
    apiFetch<SubscriberPage>(`/admin/newsletter?${query}&page=${page}&limit=20`)
      .then(setData)
      .catch((err: Error) => setMessage({ ok: false, text: err.message }));
  }, [query, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [query]);

  return (
    <div className="stack">
      <div className="stat-tiles">
        <StatTile icon={faEnvelopeOpenText} tone="ico-blue" label="Người nhận bản tin" value={data?.counts.all ?? '…'} />
        <StatTile icon={faCalendarPlus} tone="ico-green" label="Đăng ký 30 ngày qua" value={data?.counts.last30d ?? '…'} />
      </div>
      <div className="panel">
        <div className="admin-toolbar">
          <span className="input-wrap grow">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input className="input input-sm" type="search" placeholder="Tìm email…" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => downloadCsv('/admin/newsletter/export', 'ban-tin.csv').catch((e: Error) => setMessage({ ok: false, text: e.message }))}>
            <FontAwesomeIcon icon={faFileCsv} /> Xuất CSV
          </button>
        </div>
        <Notice message={message} onClose={() => setMessage(null)} />
        {!data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <EmptyState icon={faEnvelopeOpenText} title="Chưa có người đăng ký">
            <p>Khách đăng ký nhận tin ở chân trang sẽ xuất hiện tại đây.</p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Ngày đăng ký</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id}>
                    <td>{s.email}</td>
                    <td className="small">{formatDateTime(s.createdAt)}</td>
                    <td className="actions">
                      <ConfirmButton
                        label="Xóa"
                        confirmLabel="Chắc chắn xóa?"
                        icon={faTrashCan}
                        onConfirm={async () => {
                          try {
                            await apiFetch(`/admin/newsletter/${s.id}`, { method: 'DELETE' });
                            setMessage({ ok: true, text: `Đã xóa ${s.email}` });
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
        {data && <Pager page={data.page} totalPages={data.totalPages} total={data.total} unit="email" onPage={setPage} />}
      </div>
    </div>
  );
}
