'use client';

import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Đánh dấu tab này đã đi qua ít nhất 1 trang khác của website (sessionStorage: riêng từng tab) */
const NAV_KEY = 'hs_in_app_nav';

/** Trang "cha" hợp lý khi khách mở thẳng 1 trang (link chia sẻ, tab mới) và không có lịch sử để lùi */
function parentOf(path: string): { href: string; label: string } {
  if (path.startsWith('/orders/')) return { href: '/orders', label: 'Đơn mua' };
  if (path.startsWith('/payment/')) return { href: '/orders', label: 'Đơn mua' };
  if (path === '/checkout') return { href: '/cart', label: 'Giỏ hàng' };
  if (path.startsWith('/admin') || path.startsWith('/account')) return { href: '/', label: 'Trang chủ' };
  return { href: '/', label: 'Trang chủ' };
}

/**
 * Nút "Quay lại" ở đầu mọi trang (trừ trang chủ): quay về đúng trang trước trong lịch sử duyệt;
 * nếu khách vào thẳng trang này (không có trang trước cùng website) thì về trang cha hợp lý.
 */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const first = useRef(pathname);

  // Đổi trang trong app (Next.js không tải lại trang) → có trang trước thuộc website để lùi về
  useEffect(() => {
    if (pathname !== first.current) {
      try {
        sessionStorage.setItem(NAV_KEY, '1');
      } catch {
        /* storage bị chặn */
      }
    }
  }, [pathname]);

  if (pathname === '/') return null;
  const parent = parentOf(pathname);

  function back() {
    let inApp = false;
    try {
      inApp = sessionStorage.getItem(NAV_KEY) === '1' || (document.referrer !== '' && new URL(document.referrer).origin === window.location.origin);
    } catch {
      inApp = false;
    }
    // Vào thẳng từ link ngoài (Zalo, Facebook, tab mới) → không lùi ra khỏi website mà về trang cha
    if (inApp && window.history.length > 1) router.back();
    else router.push(parent.href);
  }

  return (
    <nav className="back-nav" aria-label="Điều hướng quay lại">
      <button type="button" className="back-btn" onClick={back}>
        <FontAwesomeIcon icon={faArrowLeft} /> Quay lại
      </button>
    </nav>
  );
}
