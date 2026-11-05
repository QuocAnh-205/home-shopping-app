'use client';

import { faClockRotateLeft, faMagnifyingGlass, faRotate } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { ACTION_LABEL, formatDateTime, toQuery, type AuditLog } from '@/lib/admin';
import { apiFetch } from '@/lib/client-api';
import type { Page } from '@/lib/types';
import { Loading, Notice, Pager, useDebounced } from './ui';

const ENTITY_LABEL: Record<string, string> = {
  order: 'Đơn hàng',
  product: 'Sản phẩm',
  category: 'Danh mục',
  user: 'Người dùng',
  review: 'Đánh giá',
  newsletter: 'Bản tin',
};

/** Nhật ký thao tác quản trị: ai làm gì, lúc nào (phục vụ truy vết & kiểm toán) */
export function AuditLogAdmin() {
  const [q, setQ] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditLog> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const dq = useDebounced(q);
  const query = toQuery({ q: dq.trim(), entityType });

  const load = useCallback(() => {
    apiFetch<Page<AuditLog>>(`/admin/audit-logs?${query}&page=${page}&limit=25`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [query, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [query]);

  return (
    <div className="panel">
      <div className="admin-toolbar">
        <span className="input-wrap grow">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          <input className="input input-sm" type="search" placeholder="Nội dung, mã đối tượng, email người thực hiện…" value={q} onChange={(e) => setQ(e.target.value)} />
        </span>
        <select className="input input-sm" value={entityType} onChange={(e) => setEntityType(e.target.value)} aria-label="Loại">
          <option value="">Mọi loại</option>
          {Object.entries(ENTITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          <FontAwesomeIcon icon={faRotate} /> Làm mới
        </button>
      </div>
      {error && <Notice message={{ ok: false, text: error }} />}
      {!data ? (
        <Loading label="Đang tải nhật ký…" />
      ) : data.items.length === 0 ? (
        <EmptyState icon={faClockRotateLeft} title="Chưa có thao tác nào">
          <p>Mọi thay đổi của quản trị viên (đơn hàng, sản phẩm, người dùng…) sẽ được ghi lại tại đây.</p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người thực hiện</th>
                <th>Hành động</th>
                <th>Nội dung</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <Fragment key={l.id}>
                  <tr className={l.metadata ? 'row-click' : ''} onClick={() => l.metadata && setOpen(open === l.id ? null : l.id)}>
                    <td className="small nowrap">{formatDateTime(l.createdAt)}</td>
                    <td className="small">{l.actor ? `${l.actor.fullName} (${l.actor.email})` : <span className="muted">Tài khoản đã xóa</span>}</td>
                    <td>
                      <span className="badge badge-muted">{ENTITY_LABEL[l.entityType] ?? l.entityType}</span>
                      <div className="small">{ACTION_LABEL[l.action] ?? l.action}</div>
                    </td>
                    <td className="small">{l.summary}</td>
                  </tr>
                  {open === l.id && (
                    <tr className="detail-row">
                      <td colSpan={4}>
                        <pre className="code-block">{JSON.stringify(l.metadata, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} totalPages={data.totalPages} total={data.total} unit="thao tác" onPage={setPage} />}
    </div>
  );
}
