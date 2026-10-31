'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AuthResponse, Cart, UserProfile } from './types';

const SESSION_KEY = 'hs_session';
const SESSION_EVENT = 'hs:session';
const CART_EVENT = 'hs:cart';

interface Session {
  token: string;
  expiresAt: string;
  user: UserProfile;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------------- Session (localStorage + đồng bộ giữa các tab) ----------------

let cachedRaw: string | null = null;
let cachedSession: Session | null = null;

function readSession(): Session | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (raw === cachedRaw) return cachedSession;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    cachedSession = parsed && new Date(parsed.expiresAt).getTime() > Date.now() ? parsed : null;
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

export function getSession(): Session | null {
  return typeof window === 'undefined' ? null : readSession();
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function saveSession(auth: AuthResponse | null): void {
  try {
    if (auth) {
      const session: Session = { token: auth.accessToken, expiresAt: auth.expiresAt, user: auth.user };
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* Trình duyệt chặn storage: phiên chỉ sống trong bộ nhớ */
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
  notifyCartChanged();
}

function subscribeSession(callback: () => void): () => void {
  window.addEventListener(SESSION_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(SESSION_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** Hook phiên đăng nhập; `ready=false` trong lần render đầu (SSR) để tránh hydration mismatch */
export function useSession(): { session: Session | null; ready: boolean } {
  const session = useSyncExternalStore(subscribeSession, readSession, () => null);
  const ready = useSyncExternalStore(subscribeSession, () => true, () => false);
  return { session, ready };
}

export async function logout(): Promise<void> {
  try {
    if (getToken()) await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    /* Token hết hạn/đã thu hồi: vẫn xóa phiên phía client */
  }
  saveSession(null);
}

// ---------------- Giỏ hàng ----------------

export function notifyCartChanged(): void {
  window.dispatchEvent(new Event(CART_EVENT));
}

export function useCartCount(): number {
  const { session } = useSession();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!session) {
      setCount(0);
      return;
    }
    let active = true;
    const load = () =>
      apiFetch<Cart>('/cart')
        .then((c) => active && setCount(c.totalItems))
        .catch(() => active && setCount(0));
    void load();
    window.addEventListener(CART_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(CART_EVENT, load);
    };
  }, [session]);

  return count;
}

// ---------------- HTTP ----------------

const ERROR_VI: Record<number, string> = {
  401: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
  403: 'Bạn không có quyền thực hiện thao tác này',
  429: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
  502: 'Hệ thống đang cập nhật, vui lòng thử lại',
  503: 'Hệ thống đang bận, vui lòng thử lại',
};

const MESSAGE_VI: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Invalid email or password$/, () => 'Email hoặc mật khẩu không đúng'],
  [/^Email already registered$/, () => 'Email này đã được đăng ký'],
  [/^Too many failed attempts\. Try again in (\d+) minutes$/, (m) => `Sai mật khẩu quá nhiều lần, thử lại sau ${m[1]} phút`],
  [/^Only (\d+) items left in stock$/, (m) => `Chỉ còn ${m[1]} sản phẩm trong kho`],
  [/^Product .* is out of stock$/, () => 'Một sản phẩm trong giỏ vừa hết hàng, vui lòng cập nhật giỏ'],
  [/^Cart is empty$/, () => 'Giỏ hàng đang trống'],
  [/^Cart cannot contain more than (\d+) products$/, (m) => `Giỏ hàng tối đa ${m[1]} loại sản phẩm`],
  [/^password must contain/, () => 'Mật khẩu phải có chữ hoa, chữ thường và chữ số'],
  [/^phone must be a valid/, () => 'Số điện thoại không hợp lệ'],
  [/^Order in status .* can no longer be cancelled/, () => 'Đơn hàng đã được xử lý, không thể hủy'],
  [/^Order was modified concurrently/, () => 'Đơn hàng vừa được người khác cập nhật, vui lòng tải lại'],
  [/^Reset link is invalid or has expired$/, () => 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn'],
  [/^Current password is incorrect$/, () => 'Mật khẩu hiện tại không đúng'],
  [/^comment must be at least 10 characters$/, () => 'Nội dung đánh giá cần ít nhất 10 ký tự'],
  [/^comment must be shorter than or equal to 1000 characters$/, () => 'Nội dung đánh giá tối đa 1000 ký tự'],
  [/^Login code is invalid or expired$/, () => 'Phiên đăng nhập mạng xã hội đã hết hạn, vui lòng thử lại'],
  [/^compareAtPrice must be greater than price$/, () => 'Giá gốc phải lớn hơn giá bán'],
  [/^email must be an email$/, () => 'Email không hợp lệ'],
];

/** Mã lỗi OAuth (từ ?oauth_error=) → thông điệp tiếng Việt */
export const OAUTH_ERROR_VI: Record<string, string> = {
  not_configured: 'Máy chủ chưa được kết nối với Google/Facebook (thiếu Client ID & Secret). Bạn vẫn có thể đăng nhập bằng email; quản trị viên xem hướng dẫn bật trong README.',
  access_denied: 'Bạn đã hủy đăng nhập.',
  invalid_state: 'Phiên đăng nhập đã hết hạn, vui lòng thử lại.',
  email_required: 'Tài khoản mạng xã hội chưa chia sẻ email. Vui lòng cấp quyền email hoặc đăng ký bằng email.',
  email_unverified: 'Email của tài khoản mạng xã hội chưa được xác minh.',
  already_linked: 'Tài khoản mạng xã hội này đã liên kết với một tài khoản khác.',
  link_expired: 'Yêu cầu liên kết đã hết hạn, vui lòng thử lại.',
  token_exchange_failed: 'Không xác thực được với nhà cung cấp, vui lòng thử lại.',
  profile_failed: 'Không lấy được thông tin tài khoản, vui lòng thử lại.',
};

function translate(message: string): string {
  for (const [re, fn] of MESSAGE_VI) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  return message;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    // Trình duyệt gọi /api cùng origin → Nginx proxy sang backend (không cần CORS)
    res = await fetch(`/api${path}`, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ, kiểm tra kết nối mạng');
  }

  if (res.status === 401 && token && !path.startsWith('/auth/')) saveSession(null);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const raw = Array.isArray(body.message) ? body.message : body.message ? [body.message] : [];
    const translated = raw.map(translate);
    const serverMsg = translated.join(', ') || undefined;
    // Lỗi nghiệp vụ (4xx cụ thể hoặc đã có bản dịch) → hiện chi tiết; lỗi hạ tầng → thông điệp chung
    const specific = [400, 404, 409].includes(res.status) || translated.some((t, i) => t !== raw[i]);
    const message = specific ? serverMsg : ERROR_VI[res.status] ?? serverMsg;
    throw new ApiError(res.status, message ?? `Yêu cầu thất bại (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
