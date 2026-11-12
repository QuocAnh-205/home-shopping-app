'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { apiFetch, saveSession, useSession } from '@/lib/client-api';
import type { AuthResponse } from '@/lib/types';

interface GoogleId {
  initialize(cfg: Record<string, unknown>): void;
  prompt(): void;
  cancel(): void;
  disableAutoSelect(): void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
/** Không làm phiền ở các trang đang xử lý đăng nhập / quản trị / thanh toán */
const SKIP = [/^\/auth\//, /^\/admin/, /^\/checkout/, /^\/payment\//, /^\/reset-password/];

let configPromise: Promise<string | null> | null = null;
function googleClientId(): Promise<string | null> {
  configPromise ??= apiFetch<{ googleClientId: string | null }>('/auth/oauth/one-tap-config')
    .then((c) => c.googleClientId)
    .catch(() => null);
  return configPromise;
}

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const s = existing ?? Object.assign(document.createElement('script'), { src: SCRIPT_SRC, async: true, defer: true });
    s.addEventListener('load', () => resolve(), { once: true });
    s.addEventListener('error', () => reject(new Error('gsi')), { once: true });
    if (!existing) document.head.appendChild(s);
  });
}

/**
 * Google One Tap (qua FedCM của Chrome): khách CHƯA đăng nhập shop nhưng đang đăng nhập Google trên trình duyệt
 * sẽ thấy hộp "Tiếp tục với tư cách <tên>" → 1 chạm là vào đúng tài khoản (tài khoản cũ cùng email được tự liên kết).
 * Khách đã từng đồng ý trước đó → tự đăng nhập luôn (auto_select). Đăng xuất thì tắt tự chọn để không bị vào lại.
 */
export function GoogleOneTap() {
  const { session, ready } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready || session || SKIP.some((re) => re.test(pathname))) return;
    let cancelled = false;
    (async () => {
      const clientId = await googleClientId();
      if (!clientId || cancelled) return;
      await loadScript();
      const id = window.google?.accounts?.id;
      if (!id || cancelled) return;
      id.initialize({
        client_id: clientId,
        auto_select: true,
        cancel_on_tap_outside: true,
        context: 'signin',
        itp_support: true,
        use_fedcm_for_prompt: true,
        callback: async ({ credential }: { credential?: string }) => {
          if (!credential) return;
          try {
            const auth = await apiFetch<AuthResponse>('/auth/oauth/google/one-tap', { method: 'POST', body: JSON.stringify({ credential }) });
            saveSession(auth);
            router.refresh();
          } catch {
            /* Token không hợp lệ / tài khoản bị khóa → khách vẫn đăng nhập theo cách thường */
          }
        },
      });
      id.prompt();
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel();
    };
  }, [ready, session, pathname, router]);

  return null;
}
