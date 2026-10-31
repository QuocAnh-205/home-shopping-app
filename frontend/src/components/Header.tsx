'use client';

import {
  faBagShopping,
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
import { logout, useCartCount, useSession } from '@/lib/client-api';
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
        placeholder="Tìm nồi chiên, sofa, chăn ga…"
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
  const active = (href: string) => (pathname.startsWith(href) ? 'icon-btn active' : 'icon-btn');

  async function onLogout() {
    await logout();
    router.push('/');
    router.refresh();
  }

  const initials = session?.user.fullName
    .split(/\s+/)
    .slice(-1)[0]
    ?.charAt(0)
    .toUpperCase();

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="Home Shopping - Trang chủ">
          <span className="brand-mark">
            <FontAwesomeIcon icon={faHouseChimney} />
          </span>
          <span>
            Home Shopping
            <small>Đồ gia dụng</small>
          </span>
        </Link>

        <Suspense fallback={<div className="header-search" />}>
          <HeaderSearch />
        </Suspense>

        <nav className="header-actions" aria-label="Tài khoản và giỏ hàng">
          <ThemeToggle />
          {ready && session && (
            <Link href="/orders" className={`${active('/orders')} desktop-only`}>
              <FontAwesomeIcon icon={faReceipt} fixedWidth />
              <span className="label">Đơn hàng</span>
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
                <span className="avatar" aria-hidden>
                  {initials}
                </span>
                <span className="name">{session.user.fullName}</span>
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
