'use client';

import {
  faBell,
  faBuildingColumns,
  faChevronRight,
  faCoins,
  faGauge,
  faGear,
  faIdCard,
  faKey,
  faLink,
  faLocationDot,
  faMoon,
  faReceipt,
  faRightFromBracket,
  faStar,
  faTicket,
  faTruck,
  faUserLock,
  faUserPen,
  faWallet,
  faBoxOpen,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, logout, useUnreadNotifications } from '@/lib/client-api';
import { formatDay, initials, type AccountProfile, type Order } from '@/lib/types';

/** 4 lối tắt "Đơn mua" theo trạng thái (khớp tab ở /orders) */
const ORDER_SHORTCUTS: { tab: string; label: string; icon: IconDefinition; statuses: Order['status'][] }[] = [
  { tab: 'awaiting_payment', label: 'Chờ thanh toán', icon: faWallet, statuses: ['AWAITING_PAYMENT'] },
  { tab: 'to_ship', label: 'Chờ lấy hàng', icon: faBoxOpen, statuses: ['PENDING', 'PROCESSING'] },
  { tab: 'shipping', label: 'Chờ giao hàng', icon: faTruck, statuses: ['SHIPPING'] },
  { tab: 'completed', label: 'Đánh giá', icon: faStar, statuses: ['DELIVERED'] },
];

function useDarkTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), []);
  return [
    dark,
    () => {
      const next = dark ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('hs_theme', next);
      } catch {
        /* storage bị chặn: chỉ áp dụng cho phiên hiện tại */
      }
      setDark(!dark);
    },
  ];
}

function Row({ href, icon, label, meta, badge }: { href: string; icon: IconDefinition; label: string; meta?: string; badge?: number }) {
  return (
    <li>
      <Link href={href} className="me-row">
        <FontAwesomeIcon icon={icon} fixedWidth className="me-row-ico" />
        <span className="me-row-label">{label}</span>
        {badge ? <span className="badge-count inline">{badge > 99 ? '99+' : badge}</span> : null}
        {meta && <span className="muted small">{meta}</span>}
        <FontAwesomeIcon icon={faChevronRight} className="muted me-row-chev" />
      </Link>
    </li>
  );
}

/**
 * Trang "Tôi" trên điện thoại (giống tab "Tôi" của app Shopee): thẻ người dùng, lối tắt đơn mua theo trạng thái,
 * ví xu / voucher và danh sách cài đặt. Màn hình rộng vẫn dùng menu bên trái như cũ.
 */
export function MeHub({ profile }: { profile: AccountProfile }) {
  const router = useRouter();
  const unread = useUnreadNotifications();
  const [dark, toggleDark] = useDarkTheme();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    apiFetch<Order[]>('/orders')
      .then((orders) => {
        const next: Record<string, number> = {};
        for (const s of ORDER_SHORTCUTS) next[s.tab] = orders.filter((o) => s.statuses.includes(o.status)).length;
        setCounts(next);
      })
      .catch(() => setCounts({}));
  }, []);

  return (
    <div className="me-hub">
      <div className="me-card">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar avatar-img me-avatar" src={profile.avatarUrl} alt="" width={64} height={64} referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar me-avatar">{initials(profile.fullName)}</span>
        )}
        <span className="me-card-info">
          <strong>{profile.fullName}</strong>
          <span className="small">@{profile.username}</span>
          <span className="small me-card-since">Thành viên từ {formatDay(profile.createdAt)}</span>
        </span>
        <Link href="/account?tab=profile" className="me-card-edit" aria-label="Sửa hồ sơ">
          <FontAwesomeIcon icon={faUserPen} />
        </Link>
      </div>

      <section className="me-section">
        <Link href="/orders" className="me-section-head">
          <span>
            <FontAwesomeIcon icon={faReceipt} /> Đơn mua
          </span>
          <span className="muted small">
            Xem lịch sử mua hàng <FontAwesomeIcon icon={faChevronRight} />
          </span>
        </Link>
        <div className="me-shortcuts">
          {ORDER_SHORTCUTS.map((s) => (
            <Link key={s.tab} href={`/orders?tab=${s.tab}`}>
              <span className="icon-badge">
                <FontAwesomeIcon icon={s.icon} />
                {counts[s.tab] ? <span className="badge-count">{counts[s.tab]}</span> : null}
              </span>
              <span>{s.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="me-section">
        <div className="me-wallet">
          <Link href="/account?tab=coins">
            <FontAwesomeIcon icon={faCoins} className="acc-nav-coin" />
            <strong>{profile.coinBalance.toLocaleString('vi-VN')}</strong>
            <span className="muted small">Xu của tôi</span>
          </Link>
          <Link href="/account?tab=vouchers">
            <FontAwesomeIcon icon={faTicket} className="acc-nav-sale" />
            <strong>Kho voucher</strong>
            <span className="muted small">Mã giảm giá</span>
          </Link>
          <Link href="/account?tab=notifications">
            <span className="icon-badge">
              <FontAwesomeIcon icon={faBell} />
            </span>
            <strong>{unread.total}</strong>
            <span className="muted small">Chưa đọc</span>
          </Link>
        </div>
      </section>

      <section className="me-section">
        <h2 className="me-section-title">Tài khoản của tôi</h2>
        <ul className="me-list">
          <Row href="/account?tab=profile" icon={faUserPen} label="Hồ sơ" />
          <Row href="/account?tab=address" icon={faLocationDot} label="Sổ địa chỉ" />
          <Row href="/account?tab=bank" icon={faBuildingColumns} label="Tài khoản ngân hàng" />
          <Row href="/account?tab=password" icon={faKey} label="Đổi mật khẩu" />
          <Row href="/account?tab=linked" icon={faLink} label="Liên kết Google / Facebook" />
        </ul>
      </section>

      <section className="me-section">
        <h2 className="me-section-title">Cài đặt</h2>
        <ul className="me-list">
          <Row href="/account?tab=notify-settings" icon={faGear} label="Cài đặt thông báo" />
          <Row href="/account?tab=privacy" icon={faUserLock} label="Thiết lập riêng tư" />
          <Row href="/account?tab=personal" icon={faIdCard} label="Thông tin cá nhân" />
          <li>
            <label className="me-row">
              <FontAwesomeIcon icon={faMoon} fixedWidth className="me-row-ico" />
              <span className="me-row-label">Giao diện tối</span>
              <input type="checkbox" className="switch" checked={dark} onChange={toggleDark} aria-label="Giao diện tối" />
            </label>
          </li>
          {profile.role === 'ADMIN' && <Row href="/admin" icon={faGauge} label="Trang quản trị" />}
        </ul>
      </section>

      <button
        type="button"
        className="btn btn-ghost btn-block me-logout"
        onClick={async () => {
          await logout();
          router.push('/');
        }}
      >
        <FontAwesomeIcon icon={faRightFromBracket} /> Đăng xuất
      </button>
    </div>
  );
}
