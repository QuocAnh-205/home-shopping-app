'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/client-api';
import type { Role } from '@/lib/types';

/**
 * Chặn trang cần đăng nhập ở phía client (UX). Bảo mật thực sự nằm ở backend:
 * mọi API đều kiểm tra JWT + role, nên bỏ qua component này cũng không lấy được dữ liệu.
 */
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, ready } = useSession();

  useEffect(() => {
    if (ready && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, session, router, pathname]);

  if (!ready || !session) return <div className="skeleton">Đang kiểm tra đăng nhập…</div>;
  if (role && session.user.role !== role) {
    return (
      <div className="panel center">
        <h1>403 - Không có quyền truy cập</h1>
        <p className="muted">Trang này chỉ dành cho quản trị viên.</p>
      </div>
    );
  }
  return <>{children}</>;
}
