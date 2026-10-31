'use client';

import { faFacebookF, faGoogle } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';

type Providers = { google: boolean; facebook: boolean };

const PROVIDERS = [
  { id: 'google', label: 'Google', icon: faGoogle },
  { id: 'facebook', label: 'Facebook', icon: faFacebookF },
] as const;

/**
 * Nút đăng nhập/đăng ký bằng Google, Facebook. Điều hướng toàn trang tới backend (OAuth Authorization Code):
 * không dùng popup/SDK của bên thứ 3 → không cần nới lỏng CSP, token không đi qua JavaScript của nhà cung cấp.
 */
export function SocialButtons({ mode, next }: { mode: 'login' | 'register'; next: string }) {
  const [providers, setProviders] = useState<Providers | null>(null);

  useEffect(() => {
    apiFetch<Providers>('/auth/oauth/providers')
      .then(setProviders)
      .catch(() => setProviders({ google: false, facebook: false }));
  }, []);

  const verb = mode === 'login' ? 'Đăng nhập' : 'Đăng ký';

  return (
    <div className="social">
      {PROVIDERS.map((p) => {
        const enabled = providers?.[p.id] ?? false;
        return enabled ? (
          <a key={p.id} className={`btn-social btn-${p.id}`} href={`/api/auth/oauth/${p.id}?next=${encodeURIComponent(next)}`}>
            <FontAwesomeIcon icon={p.icon} /> {verb} với {p.label}
          </a>
        ) : (
          <button
            key={p.id}
            type="button"
            className={`btn-social btn-${p.id}`}
            disabled
            title={providers ? `${p.label} chưa được quản trị viên cấu hình (xem README)` : 'Đang tải…'}
          >
            <FontAwesomeIcon icon={p.icon} /> {verb} với {p.label}
          </button>
        );
      })}
      {providers && !providers.google && !providers.facebook && (
        <small className="muted center">Đăng nhập mạng xã hội sẽ khả dụng khi quản trị viên cấu hình khóa ứng dụng.</small>
      )}
    </div>
  );
}
