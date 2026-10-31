'use client';

import { faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { safeNext } from '@/components/auth/LoginForm';
import { apiFetch, saveSession } from '@/lib/client-api';
import type { AuthResponse } from '@/lib/types';

/** Nhận mã đăng nhập 1 lần từ backend sau OAuth, đổi lấy access token bằng POST (token không nằm trên URL) */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // React StrictMode gọi effect 2 lần ở dev → chặn để mã 1 lần không bị tiêu thụ 2 lần
    if (started.current) return;
    started.current = true;
    const code = params.get('code');
    const next = safeNext(params.get('next'));
    if (!code) {
      setError('Thiếu mã đăng nhập');
      return;
    }
    apiFetch<AuthResponse>('/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ code }) })
      .then((auth) => {
        saveSession(auth);
        router.replace(next);
        router.refresh();
      })
      .catch((err: Error) => setError(err.message));
  }, [params, router]);

  if (error) {
    return (
      <div className="empty">
        <span className="empty-ico">
          <FontAwesomeIcon icon={faTriangleExclamation} />
        </span>
        <h3>Đăng nhập không thành công</h3>
        <p>{error}</p>
        <Link className="btn" href="/login">
          Thử lại
        </Link>
      </div>
    );
  }
  return (
    <div className="skeleton">
      <FontAwesomeIcon icon={faSpinner} spin /> Đang hoàn tất đăng nhập…
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="skeleton">Đang tải…</div>}>
      <Callback />
    </Suspense>
  );
}
