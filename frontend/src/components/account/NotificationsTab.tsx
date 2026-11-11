'use client';

import { faBell, faCheckDouble, faCoins, faCreditCard, faGift, faReceipt, faShieldHalved, faSpinner } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, notifyNotificationsChanged, useUnreadNotifications } from '@/lib/client-api';
import { formatDate, type AppNotification, type NotificationPage, type NotificationType } from '@/lib/types';

const TYPES: { id: NotificationType | ''; label: string; icon: IconDefinition }[] = [
  { id: '', label: 'Tất cả', icon: faBell },
  { id: 'ORDER', label: 'Cập nhật đơn hàng', icon: faReceipt },
  { id: 'PAYMENT', label: 'Thanh toán', icon: faCreditCard },
  { id: 'PROMOTION', label: 'Khuyến mãi', icon: faGift },
  { id: 'COINS', label: 'Xu', icon: faCoins },
  { id: 'ACCOUNT', label: 'Tài khoản', icon: faShieldHalved },
];
const ICON = Object.fromEntries(TYPES.filter((t) => t.id).map((t) => [t.id, t.icon])) as Record<NotificationType, IconDefinition>;

/** Thông báo: lọc theo loại, đánh dấu đã đọc, bấm để mở đơn / ví xu / voucher */
export function NotificationsTab() {
  const router = useRouter();
  const unread = useUnreadNotifications();
  const [type, setType] = useState<NotificationType | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NotificationPage | null>(null);

  const load = useCallback(() => {
    apiFetch<NotificationPage>(`/notifications?page=${page}${type ? `&type=${type}` : ''}`)
      .then(setData)
      .catch(() => setData({ items: [], page: 1, totalPages: 1, unread: 0 }));
  }, [type, page]);
  useEffect(load, [load]);

  async function open(n: AppNotification) {
    if (!n.readAt) {
      await apiFetch(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
      notifyNotificationsChanged();
    }
    if (n.link) router.push(n.link);
    else load();
  }

  async function readAll() {
    await apiFetch(`/notifications/read-all${type ? `?type=${type}` : ''}`, { method: 'POST' });
    notifyNotificationsChanged();
    load();
  }

  return (
    <section className="panel acc-panel">
      <header className="acc-head acc-head-row">
        <div>
          <h2>Thông báo</h2>
          <p className="muted">Cập nhật đơn hàng, thanh toán, xu và ưu đãi dành cho bạn</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={readAll} disabled={!unread.total}>
          <FontAwesomeIcon icon={faCheckDouble} /> Đánh dấu đã đọc tất cả
        </button>
      </header>

      <div className="order-tabs" role="tablist">
        {TYPES.map((t) => {
          const count = t.id ? (unread[t.id] ?? 0) : unread.total;
          return (
            <button
              key={t.id || 'all'}
              role="tab"
              aria-selected={type === t.id}
              className={type === t.id ? 'active' : undefined}
              onClick={() => {
                setType(t.id);
                setPage(1);
              }}
            >
              {t.label}
              {count > 0 && <span className="tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {!data ? (
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải thông báo…
        </div>
      ) : data.items.length === 0 ? (
        <div className="acc-empty">
          <FontAwesomeIcon icon={faBell} size="2x" className="muted" />
          <strong>Chưa có thông báo nào</strong>
          <p className="muted">Thông báo về đơn hàng, thanh toán và ưu đãi sẽ xuất hiện ở đây.</p>
        </div>
      ) : (
        <ul className="notify-list">
          {data.items.map((n) => (
            <li key={n.id}>
              <button className={n.readAt ? 'notify-item' : 'notify-item unread'} onClick={() => open(n)}>
                <span className={`notify-ico notify-${n.type.toLowerCase()}`} aria-hidden>
                  <FontAwesomeIcon icon={ICON[n.type]} />
                </span>
                <span className="notify-body">
                  <strong>{n.title}</strong>
                  <span>{n.body}</span>
                  <time className="muted small">{formatDate(n.createdAt)}</time>
                </span>
                {!n.readAt && <span className="notify-dot" aria-label="Chưa đọc" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.totalPages > 1 && (
        <nav className="pagination" aria-label="Phân trang thông báo">
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span className="muted">
            Trang {page}/{data.totalPages}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            Sau
          </button>
        </nav>
      )}
    </section>
  );
}
