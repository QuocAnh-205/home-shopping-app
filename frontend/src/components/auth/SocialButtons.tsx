'use client';

import { useEffect, useState } from 'react';

/** Logo "G" 4 màu chính thức của Google (theo Google Sign-In branding guidelines) */
export function GoogleLogo() {
  return (
    <svg className="social-logo" viewBox="0 0 48 48" width="20" height="20" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Logo Facebook chính thức: hình tròn xanh #0866FF, chữ "f" trắng (nền trắng để đúng màu cả ở giao diện tối) */
export function FacebookLogo() {
  return (
    <svg className="social-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="11.5" fill="#fff" />
      <path
        fill="#0866FF"
        d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"
      />
    </svg>
  );
}

const PROVIDERS = [
  { id: 'google', label: 'Google', Logo: GoogleLogo },
  { id: 'facebook', label: 'Facebook', Logo: FacebookLogo },
] as const;

type ProviderId = (typeof PROVIDERS)[number]['id'];

/**
 * Nút đăng nhập/đăng ký bằng Google, Facebook – luôn hiển thị và bấm được.
 * Điều hướng toàn trang tới backend (OAuth Authorization Code): không dùng popup/SDK của bên thứ 3
 * → không cần nới lỏng CSP, token không đi qua JavaScript của nhà cung cấp.
 * Nếu server chưa cấu hình Client ID/Secret cho nhà cung cấp (GET /api/auth/oauth/providers),
 * bấm nút chỉ hiện một dòng nhắc nhẹ thay vì đưa người dùng qua trang lỗi.
 */
export function SocialButtons({ mode, next }: { mode: 'login' | 'register'; next: string }) {
  const verb = mode === 'login' ? 'Đăng nhập' : 'Đăng ký';
  const [enabled, setEnabled] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/oauth/providers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => alive && data && setEnabled(data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="social">
      {PROVIDERS.map(({ id, label, Logo }) => (
        <a
          key={id}
          className={`btn-social btn-${id}`}
          href={`/api/auth/oauth/${id}?next=${encodeURIComponent(next)}`}
          onClick={(e) => {
            if (enabled[id] === false) {
              e.preventDefault();
              setNotice(`${verb} bằng ${label} sẽ sớm được hỗ trợ. Hiện bạn vui lòng dùng email và mật khẩu.`);
            }
          }}
        >
          <Logo /> {verb} bằng {label}
        </a>
      ))}
      {notice && (
        <small className="social-note" role="status">
          {notice}
        </small>
      )}
    </div>
  );
}
