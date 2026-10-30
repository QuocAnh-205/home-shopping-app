'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout, useCartCount, useSession } from '@/lib/client-api';

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { session, ready } = useSession();
  const cartCount = useCartCount();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  async function onLogout() {
    await logout();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          <span aria-hidden>🏠</span> Home Shopping
        </Link>
        <nav className="nav" aria-label="Điều hướng chính">
          <Link href="/" className={isActive('/') ? 'active' : undefined}>
            Sản phẩm
          </Link>
          <Link href="/cart" className={`cart-link ${isActive('/cart') ? 'active' : ''}`}>
            Giỏ hàng
            {cartCount > 0 && (
              <span className="cart-count" aria-label={`${cartCount} sản phẩm`}>
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </Link>
          {ready && session && (
            <Link href="/orders" className={isActive('/orders') ? 'active' : undefined}>
              Đơn hàng
            </Link>
          )}
          {ready && session?.user.role === 'ADMIN' && (
            <Link href="/admin" className={isActive('/admin') ? 'active' : undefined}>
              Quản trị
            </Link>
          )}
          {ready &&
            (session ? (
              <span className="user-menu">
                <span className="user-name" title={session.user.email}>
                  👤 {session.user.fullName}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
                  Đăng xuất
                </button>
              </span>
            ) : (
              <Link href="/login" className="btn btn-sm">
                Đăng nhập
              </Link>
            ))}
        </nav>
      </div>
    </header>
  );
}
