'use client';

import { faEnvelope, faRightToBracket, faSpinner, faTriangleExclamation, faUserCheck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { OAUTH_ERROR_VI, apiFetch, saveSession, useSession } from '@/lib/client-api';
import type { AuthResponse } from '@/lib/types';
import { PasswordField } from './PasswordField';
import { SocialButtons } from './SocialButtons';

/** Chỉ cho phép redirect nội bộ, chống open-redirect */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, ready } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => {
    const code = params.get('oauth_error');
    return code ? (OAUTH_ERROR_VI[code] ?? 'Đăng nhập mạng xã hội thất bại, vui lòng thử lại.') : null;
  });
  const [busy, setBusy] = useState(false);
  const target = safeNext(params.get('next'));
  const resetDone = params.get('reset') === '1';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const auth = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password }),
      });
      saveSession(auth);
      router.push(auth.user.role === 'ADMIN' && target === '/' ? '/admin' : target);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (ready && session) {
    return (
      <div className="auth-done">
        <span className="success-ico">
          <FontAwesomeIcon icon={faUserCheck} />
        </span>
        <h1>Xin chào, {session.user.fullName}</h1>
        <p className="muted">Bạn đang đăng nhập bằng {session.user.email}</p>
        <div className="row row-center">
          <Link className="btn" href="/account">
            Tài khoản của tôi
          </Link>
          <Link className="btn btn-ghost" href="/">
            Tiếp tục mua sắm
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1>Chào mừng trở lại</h1>
      <p className="muted">Đăng nhập để đặt hàng, theo dõi đơn và viết đánh giá.</p>

      {resetDone && (
        <p className="alert alert-ok" role="status">
          Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.
        </p>
      )}

      <SocialButtons mode="login" next={target} />
      <div className="divider-text">
        <span>hoặc đăng nhập bằng email</span>
      </div>

      <form className="form" onSubmit={submit}>
        <label className="field">
          Email
          <span className="input-wrap">
            <FontAwesomeIcon icon={faEnvelope} />
            <input className="input" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="ban@email.com" />
          </span>
        </label>
        <PasswordField name="password" label="Mật khẩu" autoComplete="current-password" value={password} onChange={setPassword} />
        <div className="form-row-between">
          <span />
          <Link className="link small" href="/forgot-password">
            Quên mật khẩu?
          </Link>
        </div>
        {error && (
          <p className="alert" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        <button className="btn btn-lg btn-block" type="submit" disabled={busy}>
          <FontAwesomeIcon icon={busy ? faSpinner : faRightToBracket} spin={busy} />
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      <p className="auth-switch">
        Chưa có tài khoản?{' '}
        <Link className="link" href={`/register${target !== '/' ? `?next=${encodeURIComponent(target)}` : ''}`}>
          Đăng ký miễn phí
        </Link>
      </p>
    </>
  );
}
