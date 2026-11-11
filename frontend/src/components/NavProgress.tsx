'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

/**
 * Thanh tiến trình mảnh trên đỉnh màn hình khi chuyển trang.
 * Trang được render đầy đủ ở server (không còn loading.tsx trả về khung "Đang tải" rỗng) → trong lúc chờ HTML trang mới,
 * người dùng vẫn thấy phản hồi tức thì sau khi bấm link.
 */
function Progress() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [active, setActive] = useState(false);

  // URL đã đổi → trang mới đã hiển thị
  useEffect(() => setActive(false), [pathname, params]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // chỉ đổi #hash
      setActive(true);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Phòng khi điều hướng bị hủy: tự tắt sau 12 giây
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 12_000);
    return () => clearTimeout(t);
  }, [active]);

  return <div className={`nav-progress${active ? ' is-active' : ''}`} role="progressbar" aria-hidden={!active} aria-label="Đang chuyển trang" />;
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Progress />
    </Suspense>
  );
}
