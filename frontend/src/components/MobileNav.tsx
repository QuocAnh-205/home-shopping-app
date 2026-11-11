'use client';

import { faBell, faGauge, faHouse, faReceipt, faTags, faUser, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useSession, useUnreadNotifications } from '@/lib/client-api';

/** Trang có thanh hành động riêng dính đáy (Mua ngay / Mua hàng / Đặt hàng) → ẩn thanh điều hướng như các app TMĐT */
const HIDDEN_ON = [/^\/products\//, /^\/cart/, /^\/checkout/, /^\/payment\//];

interface NavItem {
  href: string;
  label: string;
  icon: IconDefinition;
  active: boolean;
  badge?: number;
}

function Nav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { session, ready } = useSession();
  const unread = useUnreadNotifications();
  if (HIDDEN_ON.some((re) => re.test(pathname))) return null;

  const isAdmin = session?.user.role === 'ADMIN';
  const sale = pathname === '/' && params.get('sale') === '1';
  const accountTab = pathname.startsWith('/account') ? params.get('tab') : null;

  // Giỏ hàng đã có ở header (góc phải trên) → thanh đáy dành cho các mục còn lại, giống app Shopee
  const items: NavItem[] = [
    { href: '/', label: 'Trang chủ', icon: faHouse, active: pathname === '/' && !sale },
    { href: '/?sale=1#products', label: 'Ưu đãi', icon: faTags, active: sale },
    isAdmin
      ? { href: '/admin', label: 'Quản trị', icon: faGauge, active: pathname.startsWith('/admin') }
      : { href: '/orders', label: 'Đơn mua', icon: faReceipt, active: pathname.startsWith('/orders') },
    {
      href: session ? '/account?tab=notifications' : '/login?next=%2Faccount%3Ftab%3Dnotifications',
      label: 'Thông báo',
      icon: faBell,
      active: accountTab === 'notifications',
      badge: session ? unread.total : 0,
    },
    session || !ready
      ? { href: '/account', label: 'Tôi', icon: faUser, active: pathname.startsWith('/account') && accountTab !== 'notifications' }
      : { href: '/login', label: 'Đăng nhập', icon: faUser, active: pathname.startsWith('/login') || pathname.startsWith('/register') },
  ];

  return (
    <nav className="mobile-nav" aria-label="Điều hướng nhanh">
      {items.map((item) => (
        <Link key={item.label} href={item.href} className={item.active ? 'active' : undefined} aria-current={item.active ? 'page' : undefined}>
          <span className="icon-badge">
            <FontAwesomeIcon icon={item.icon} />
            {item.badge ? <span className="badge-count">{item.badge > 99 ? '99+' : item.badge}</span> : null}
          </span>
          <span className="mobile-nav-label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Thanh điều hướng đáy màn hình cho điện thoại (vùng ngón cái dễ chạm) */
export function MobileNav() {
  return (
    <Suspense fallback={null}>
      <Nav />
    </Suspense>
  );
}
