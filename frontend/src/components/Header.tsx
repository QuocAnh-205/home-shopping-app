'use client';

import {
  faBagShopping,
  faBell,
  faGauge,
  faHouseChimney,
  faMagnifyingGlass,
  faReceipt,
  faRightFromBracket,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type FormEvent } from 'react';
import { logout, useCartCount, useSession, useUnreadNotifications } from '@/lib/client-api';
import { initials } from '@/lib/types';
import { ThemeToggle } from './ThemeToggle';

function HeaderSearch() {
  const router = useRouter();
  const params = useSearchParams();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}#products` : '/#products');
  }

  return (
    <form className="header-search" role="search" onSubmit={submit}>
      <FontAwesomeIcon icon={faMagnifyingGlass} />
      <input
        className="input"
        type="search"
        name="q"
        key={params.get('q') ?? ''}
        defaultValue={params.get('q') ?? ''}
        placeholder="Tìm kiếm sản phẩm…"
        maxLength={100}
        aria-label="Tìm kiếm sản phẩm"
      />
    </form>
  );
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { session, ready } = useSession();
  const cartCount = useCartCount();
  const unread = useUnreadNotifications();
  const active = (href: string) => (pathname.startsWith(href) ? 'icon-btn active' : 'icon-btn');

  async function onLogout() {
    await logout();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="Home Shopping - Trang chủ">
          <span className="brand-mark">
            <FontAwesomeIcon icon={faHouseChimney} />
          </span>
          <span className="brand-text">
            Home Shopping
            <small>Đồ gia dụng</small>
          </span>
        </Link>

        <Suspense fallback={<div className="header-search" />}>
          <HeaderSearch />
        </Suspense>

        <nav className="header-actions" aria-label="Tài khoản và giỏ hàng">
          {/* Điện thoại: đổi giao diện nằm trong trang "Tôi", thông báo ở thanh điều hướng đáy */}
          <span className="desktop-only">
            <ThemeToggle />
          </span>
          {ready && session && (
            <Link href="/orders" className={`${active('/orders')} desktop-only`}>
              <FontAwesomeIcon icon={faReceipt} fixedWidth />
              <span className="label">Đơn hàng</span>
            </Link>
          )}
          {ready && session && (
            <Link href="/account?tab=notifications" className={`${active('/account')} desktop-only`} aria-label={`Thông báo, ${unread.total} chưa đọc`}>
              <span className="icon-badge">
                <FontAwesomeIcon icon={faBell} fixedWidth />
                {unread.total > 0 && <span className="badge-count">{unread.total > 99 ? '99+' : unread.total}</span>}
              </span>
              <span className="label desktop-only">Thông báo</span>
            </Link>
          )}
          {ready && session?.user.role === 'ADMIN' && (
            <Link href="/admin" className={`${active('/admin')} desktop-only`}>
              <FontAwesomeIcon icon={faGauge} fixedWidth />
              <span className="label">Quản trị</span>
            </Link>
          )}
          <Link href="/cart" className={active('/cart')} aria-label={`Giỏ hàng, ${cartCount} sản phẩm`}>
            <span className="icon-badge">
              <FontAwesomeIcon icon={faBagShopping} fixedWidth />
              {cartCount > 0 && <span className="badge-count">{cartCount > 99 ? '99+' : cartCount}</span>}
            </span>
            <span className="label desktop-only">Giỏ hàng</span>
          </Link>
          {ready &&
            (session ? (
              <span className="user-chip desktop-only" title={session.user.email}>
                <Link href="/account" className="user-link" aria-label="Tài khoản của tôi">
                  {session.user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="avatar avatar-img" src={session.user.avatarUrl} alt="" width={32} height={32} referrerPolicy="no-referrer" />
                  ) : (
                    <span className="avatar" aria-hidden>
                      {initials(session.user.fullName)}
                    </span>
                  )}
                  <span className="name">{session.user.fullName}</span>
                </Link>
                <button type="button" className="icon-btn" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất">
                  <FontAwesomeIcon icon={faRightFromBracket} />
                </button>
              </span>
            ) : (
              <Link href="/login" className="btn btn-sm desktop-only">
                <FontAwesomeIcon icon={faUser} />
                Đăng nhập
              </Link>
            ))}
        </nav>
      </div>
    </header>
  );
}
