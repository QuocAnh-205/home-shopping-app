import { faFacebookF, faGoogle } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const PROVIDERS = [
  { id: 'google', label: 'Google', icon: faGoogle },
  { id: 'facebook', label: 'Facebook', icon: faFacebookF },
] as const;

/**
 * Nút đăng nhập/đăng ký bằng Google, Facebook – luôn bấm được.
 * Điều hướng toàn trang tới backend (OAuth Authorization Code): không dùng popup/SDK của bên thứ 3
 * → không cần nới lỏng CSP, token không đi qua JavaScript của nhà cung cấp.
 * Tài khoản mới được tạo tự động ở lần đăng nhập đầu tiên (đăng ký = đăng nhập lần đầu).
 */
export function SocialButtons({ mode, next }: { mode: 'login' | 'register'; next: string }) {
  const verb = mode === 'login' ? 'Đăng nhập' : 'Đăng ký';
  return (
    <div className="social">
      {PROVIDERS.map((p) => (
        <a key={p.id} className={`btn-social btn-${p.id}`} href={`/api/auth/oauth/${p.id}?next=${encodeURIComponent(next)}`}>
          <FontAwesomeIcon icon={p.icon} /> {verb} bằng {p.label}
        </a>
      ))}
    </div>
  );
}
