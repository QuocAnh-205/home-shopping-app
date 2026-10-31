'use client';

import { faBagShopping, faGauge, faHouse, faReceipt, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCartCount, useSession } from '@/lib/client-api';

/** Thanh điều hướng đáy màn hình cho mobile (vùng ngón cái dễ chạm) */
export function MobileNav() {
  const pathname = usePathname();
  const { session } = useSession();
  const cartCount = useCartCount();
  const isAdmin = session?.user.role === 'ADMIN';

  const items = [
    { href: '/', label: 'Trang chủ', icon: faHouse, match: (p: string) => p === '/' || p.startsWith('/products') },
    { href: '/cart', label: 'Giỏ hàng', icon: faBagShopping, match: (p: string) => p.startsWith('/cart'), badge: cartCount },
    isAdmin
      ? { href: '/admin', label: 'Quản trị', icon: faGauge, match: (p: string) => p.startsWith('/admin') }
      : { href: '/orders', label: 'Đơn hàng', icon: faReceipt, match: (p: string) => p.startsWith('/orders') },
    { href: '/login', label: session ? 'Tài khoản' : 'Đăng nhập', icon: faUser, match: (p: string) => p.startsWith('/login') },
  ];

  return (
    <nav className="mobile-nav" aria-label="Điều hướng nhanh">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={item.match(pathname) ? 'active' : undefined}>
          <span className="icon-badge">
            <FontAwesomeIcon icon={item.icon} size="lg" />
            {item.badge ? <span className="badge-count">{item.badge > 99 ? '99+' : item.badge}</span> : null}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
