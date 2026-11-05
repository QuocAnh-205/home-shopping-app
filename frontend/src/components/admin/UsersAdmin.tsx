'use client';

import {
  faArrowRightFromBracket,
  faCrown,
  faFileCsv,
  faLock,
  faLockOpen,
  faMagnifyingGlass,
  faReceipt,
  faUserCheck,
  faUserSlash,
  faUserLock,
  faUserPlus,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Stars } from '@/components/Stars';
import { StatusBadge } from '@/components/StatusBadge';
import { ROLE_LABEL, downloadCsv, formatDateTime, toQuery, type AdminUser, type AdminUserDetail, type AdminUserPage } from '@/lib/admin';
import { apiFetch, useSession } from '@/lib/client-api';
import { formatDate, formatPrice, initials, shortId, type Role } from '@/lib/types';
import { AdminDialog, ConfirmButton, Loading, Notice, Pager, StatTile, useDebounced } from './ui';

const PROVIDER_LABEL: Record<string, string> = { GOOGLE: 'Google', FACEBOOK: 'Facebook' };

function Avatar({ user }: { user: Pick<AdminUser, 'fullName' | 'avatarUrl'> }) {
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="avatar avatar-img avatar-sm" src={user.avatarUrl} alt="" />
  ) : (
    <span className="avatar avatar-sm" aria-hidden>
      {initials(user.fullName)}
    </span>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return role === 'ADMIN' ? (
    <span className="badge badge-violet">
      <FontAwesomeIcon icon={faCrown} /> {ROLE_LABEL.ADMIN}
    </span>
  ) : (
    <span className="badge badge-muted">{ROLE_LABEL.CUSTOMER}</span>
  );
}

function UserDetail({ id, onChanged, onOpenOrders }: { id: string; onChanged: () => void; onOpenOrders: (email: string) => void }) {
  const { session } = useSession();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState('');
  const isSelf = session?.user.id === id;

  useEffect(() => {
    apiFetch<AdminUserDetail>(`/admin/users/${id}`)
      .then(setUser)
      .catch((err: Error) => setMessage({ ok: false, text: err.message }));
  }, [id]);

  async function act(path: string, body: unknown, okText: string) {
    setMessage(null);
    try {
      const res = await apiFetch<AdminUserDetail | { ok: true }>(path, { method: path.endsWith('/role') ? 'PATCH' : 'POST', body: JSON.stringify(body ?? {}) });
      if ('id' in res) setUser(res);
      setMessage({ ok: true, text: okText });
      onChanged();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
  }

  if (!user) return message ? <Notice message={message} /> : <Loading />;

  return (
    <div className="stack">
      <div className="user-hero">
        <Avatar user={user} />
        <div style={{ flex: 1 }}>
          <strong>{user.fullName}</strong>
          <div className="muted small">{user.email}</div>
          <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <RoleBadge role={user.role} />
            {user.deleted ? (
              <span className="badge badge-muted">
                <FontAwesomeIcon icon={faUserSlash} /> Khách đã tự xóa tài khoản
              </span>
            ) : user.lockedAt ? (
              <span className="badge badge-danger">
                <FontAwesomeIcon icon={faLock} /> Đã khóa {formatDate(user.lockedAt)}
              </span>
            ) : (
              <span className="badge badge-ok">Đang hoạt động</span>
            )}
            {user.hasPassword && <span className="badge badge-muted">Mật khẩu</span>}
            {user.providers.map((p) => (
              <span key={p} className="badge badge-muted">
                {PROVIDER_LABEL[p] ?? p}
              </span>
            ))}
          </div>
        </div>
      </div>

      {user.lockedAt && user.lockedReason && <p className="alert">Lý do khóa: {user.lockedReason}</p>}
      <Notice message={message} onClose={() => setMessage(null)} />

      <div className="detail-grid">
        <div>
          <span className="muted small">Số điện thoại</span>
          <b>{user.phone ?? '—'}</b>
        </div>
        <div>
          <span className="muted small">Ngày sinh</span>
          <b>{user.dateOfBirth ? formatDate(user.dateOfBirth) : '—'}</b>
        </div>
        <div>
          <span className="muted small">Ngày tham gia</span>
          <b>{formatDate(user.createdAt)}</b>
        </div>
        <div>
          <span className="muted small">Đơn gần nhất</span>
          <b>{user.stats.lastOrderAt ? formatDate(user.stats.lastOrderAt) : '—'}</b>
        </div>
        <div>
          <span className="muted small">Tổng đã chi</span>
          <b className="price">{formatPrice(user.totalSpent)}</b>
        </div>
        <div>
          <span className="muted small">Giá trị TB/đơn</span>
          <b>{formatPrice(user.stats.averageOrder)}</b>
        </div>
        <div>
          <span className="muted small">Đơn (hoàn tất / hủy / chờ)</span>
          <b>
            {user.orderCount} ({user.stats.completedOrders} / {user.stats.cancelledOrders} / {user.stats.pendingOrders})
          </b>
        </div>
        <div>
          <span className="muted small">Đánh giá đã viết</span>
          <b>{user.reviewCount}</b>
        </div>
      </div>

      <section>
        <h4 className="detail-title">Quản lý tài khoản</h4>
        {user.deleted ? (
          <p className="muted small">Tài khoản đã bị khách tự xóa: thông tin cá nhân đã được ẩn danh, đơn hàng được giữ lại để đối soát. Không thể thao tác thêm.</p>
        ) : isSelf ? (
          <p className="muted small">Đây là tài khoản của bạn: không thể tự đổi quyền hoặc tự khóa.</p>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {user.role === 'CUSTOMER' ? (
                <ConfirmButton
                  label="Cấp quyền quản trị"
                  confirmLabel="Chắc chắn cấp quyền?"
                  icon={faCrown}
                  className="btn btn-sm"
                  onConfirm={() => act(`/admin/users/${id}/role`, { role: 'ADMIN' }, 'Đã cấp quyền quản trị. Người dùng cần đăng nhập lại.')}
                />
              ) : (
                <ConfirmButton
                  label="Hạ xuống khách hàng"
                  confirmLabel="Chắc chắn hạ quyền?"
                  icon={faUserCheck}
                  onConfirm={() => act(`/admin/users/${id}/role`, { role: 'CUSTOMER' }, 'Đã chuyển về khách hàng.')}
                />
              )}
              <ConfirmButton
                label="Đăng xuất mọi thiết bị"
                confirmLabel="Xác nhận đăng xuất?"
                icon={faArrowRightFromBracket}
                onConfirm={() => act(`/admin/users/${id}/logout`, {}, 'Đã đăng xuất người dùng khỏi mọi thiết bị.')}
              />
              {user.lockedAt && (
                <ConfirmButton
                  label="Mở khóa"
                  confirmLabel="Chắc chắn mở khóa?"
                  icon={faLockOpen}
                  className="btn btn-sm"
                  onConfirm={() => act(`/admin/users/${id}/unlock`, {}, 'Đã mở khóa tài khoản.')}
                />
              )}
            </div>
            {!user.lockedAt && (
              <div className="row" style={{ gap: 8 }}>
                <input className="input input-sm" style={{ flex: 1 }} placeholder="Lý do khóa (không bắt buộc)" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
                <ConfirmButton
                  label="Khóa tài khoản"
                  confirmLabel="Chắc chắn khóa?"
                  icon={faLock}
                  className="btn btn-danger btn-sm"
                  onConfirm={() => act(`/admin/users/${id}/lock`, { reason: reason.trim() || undefined }, 'Đã khóa tài khoản và đăng xuất mọi phiên.')}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {user.addresses.length > 0 && (
        <section>
          <h4 className="detail-title">Sổ địa chỉ ({user.addresses.length})</h4>
          <ul className="plain-list">
            {user.addresses.map((a) => (
              <li key={a.id}>
                <b>{a.fullName}</b> · {a.phone} {a.isDefault && <span className="badge badge-ok">Mặc định</span>}
                <div className="muted small">{a.full}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h4 className="detail-title">Đơn hàng gần đây</h4>
          {user.orderCount > 0 && (
            <button className="link-btn" onClick={() => onOpenOrders(user.email)}>
              <FontAwesomeIcon icon={faReceipt} /> Xem tất cả đơn
            </button>
          )}
        </div>
        {user.recentOrders.length === 0 ? (
          <p className="muted small">Chưa có đơn hàng.</p>
        ) : (
          <table className="table table-compact">
            <tbody>
              {user.recentOrders.map((o) => (
                <tr key={o.id}>
                  <td>#{shortId(o.id)}</td>
                  <td>{formatDateTime(o.createdAt)}</td>
                  <td>{o.itemCount} sp</td>
                  <td className="price">{formatPrice(o.totalAmount)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {user.recentReviews.length > 0 && (
        <section>
          <h4 className="detail-title">Đánh giá gần đây</h4>
          <ul className="plain-list">
            {user.recentReviews.map((r) => (
              <li key={r.id}>
                <Stars value={r.rating} /> <b>{r.product.name}</b>
                <div className="small">{r.comment}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function UsersAdmin({ onOpenOrders }: { onOpenOrders: (email: string) => void }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<'' | 'active' | 'locked' | 'deleted'>('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUserPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const dq = useDebounced(q);
  const query = toQuery({ q: dq.trim(), role, status, sort });

  const load = useCallback(() => {
    apiFetch<AdminUserPage>(`/admin/users?${query}&page=${page}&limit=20`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [query, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [query]);

  const c = data?.counts;
  return (
    <div className="stack">
      <div className="stat-tiles">
        <StatTile icon={faUsers} tone="ico-blue" label="Tất cả" value={c?.total ?? '…'} active={!role && !status} onClick={() => { setRole(''); setStatus(''); }} />
        <StatTile icon={faUserCheck} tone="ico-green" label="Khách hàng" value={c?.customers ?? '…'} active={role === 'CUSTOMER'} onClick={() => { setRole('CUSTOMER'); setStatus(''); }} />
        <StatTile icon={faCrown} tone="ico-violet" label="Quản trị viên" value={c?.admins ?? '…'} active={role === 'ADMIN'} onClick={() => { setRole('ADMIN'); setStatus(''); }} />
        <StatTile icon={faUserLock} tone="ico-orange" label="Đang bị khóa" value={c?.locked ?? '…'} active={status === 'locked'} onClick={() => { setRole(''); setStatus('locked'); }} />
        <StatTile icon={faUserPlus} tone="ico-blue" label="Mới 30 ngày" value={c?.new30d ?? '…'} />
        <StatTile icon={faUserSlash} tone="ico-violet" label="Đã tự xóa" value={c?.deleted ?? '…'} active={status === 'deleted'} onClick={() => { setRole(''); setStatus('deleted'); }} />
      </div>

      <div className="panel">
        <div className="admin-toolbar">
          <span className="input-wrap grow">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input className="input input-sm" type="search" placeholder="Tìm theo tên, email, số điện thoại…" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
          <select className="input input-sm" value={role} onChange={(e) => setRole(e.target.value as Role | '')} aria-label="Vai trò">
            <option value="">Mọi vai trò</option>
            <option value="CUSTOMER">Khách hàng</option>
            <option value="ADMIN">Quản trị viên</option>
          </select>
          <select className="input input-sm" value={status} onChange={(e) => setStatus(e.target.value as '' | 'active' | 'locked' | 'deleted')} aria-label="Trạng thái">
            <option value="">Mọi trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Đã khóa</option>
            <option value="deleted">Đã tự xóa</option>
          </select>
          <select className="input input-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sắp xếp">
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="name">Tên A→Z</option>
            <option value="email">Email A→Z</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => downloadCsv(`/admin/users/export?${query}`, 'nguoi-dung.csv').catch((e: Error) => setError(e.message))}>
            <FontAwesomeIcon icon={faFileCsv} /> Xuất CSV
          </button>
        </div>
        {error && <Notice message={{ ok: false, text: error }} />}
        {!data ? (
          <Loading label="Đang tải người dùng…" />
        ) : data.items.length === 0 ? (
          <EmptyState icon={faUsers} title="Không tìm thấy người dùng">
            <p>Thử đổi từ khóa hoặc bộ lọc.</p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Vai trò</th>
                  <th>Đăng nhập bằng</th>
                  <th className="num">Đơn</th>
                  <th className="num">Đã chi</th>
                  <th>Tham gia</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className="row-click" onClick={() => setSelected(u.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(u.id)}>
                    <td>
                      <span className="cell-product">
                        <Avatar user={u} />
                        <span>
                          <b>{u.fullName}</b>
                          <div className="muted small">{u.email}</div>
                          {u.phone && <div className="muted small">{u.phone}</div>}
                        </span>
                      </span>
                    </td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="small">{[u.hasPassword ? 'Mật khẩu' : null, ...u.providers.map((p) => PROVIDER_LABEL[p] ?? p)].filter(Boolean).join(' · ')}</td>
                    <td className="num">{u.orderCount}</td>
                    <td className="num price">{formatPrice(u.totalSpent)}</td>
                    <td className="small">{formatDate(u.createdAt)}</td>
                    <td>
                      {u.deleted ? (
                        <span className="badge badge-muted">Đã xóa</span>
                      ) : u.lockedAt ? (
                        <span className="badge badge-danger">
                          <FontAwesomeIcon icon={faLock} /> Đã khóa
                        </span>
                      ) : (
                        <span className="badge badge-ok">Hoạt động</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} totalPages={data.totalPages} total={data.total} unit="người dùng" onPage={setPage} />}
      </div>

      <AdminDialog title="Chi tiết người dùng" open={selected !== null} onClose={() => setSelected(null)} wide>
        {selected && (
          <UserDetail
            id={selected}
            onChanged={load}
            onOpenOrders={(email) => {
              setSelected(null);
              onOpenOrders(email);
            }}
          />
        )}
      </AdminDialog>
    </div>
  );
}
