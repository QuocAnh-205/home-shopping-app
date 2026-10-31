'use client';

import { faLock, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/client-api';
import type { Role } from '@/lib/types';
import { EmptyState } from './EmptyState';

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

  if (!ready || !session) {
    return (
      <div className="skeleton">
        <FontAwesomeIcon icon={faSpinner} spin /> Đang kiểm tra đăng nhập…
      </div>
    );
  }
  if (role && session.user.role !== role) {
    return (
      <EmptyState icon={faLock} title="Không có quyền truy cập">
        <p>Trang này chỉ dành cho quản trị viên.</p>
        <Link className="btn btn-ghost" href="/">
          Về trang chủ
        </Link>
      </EmptyState>
    );
  }
  return <>{children}</>;
}
