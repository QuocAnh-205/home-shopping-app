'use client';

import {
  faCircleCheck,
  faEnvelope,
  faEye,
  faEyeSlash,
  faLock,
  faReceipt,
  faRightFromBracket,
  faSpinner,
  faTriangleExclamation,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { apiFetch, logout, saveSession, useSession } from '@/lib/client-api';
import type { AuthResponse } from '@/lib/types';

function PasswordInput({ name, autoComplete, minLength }: { name: string; autoComplete: string; minLength: number }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="input-wrap">
      <FontAwesomeIcon icon={faLock} />
      <input className="input" name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={minLength} maxLength={72} required />
      <button type="button" className="reveal" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
        <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} />
      </button>
    </span>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, ready } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Chỉ cho phép redirect nội bộ, chống open-redirect
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body: Record<string, FormDataEntryValue | null> = { email: form.get('email'), password: form.get('password') };
    if (mode === 'register') {
      if (form.get('password') !== form.get('confirm')) {
        setError('Mật khẩu nhập lại không khớp');
        return;
      }
      body.fullName = form.get('fullName');
    }

    setBusy(true);
    setError(null);
    try {
      const auth = await apiFetch<AuthResponse>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
      saveSession(auth);
      router.push(auth.user.role === 'ADMIN' && target === '/' ? '/admin' : target);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="skeleton">
        <FontAwesomeIcon icon={faSpinner} spin /> Đang tải…
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/site/cat-phong-khach.webp" alt="" width={800} height={800} />
        <h2>Chào mừng đến Home Shopping</h2>
        <ul>
          <li>
            <FontAwesomeIcon icon={faCircleCheck} /> Theo dõi đơn hàng theo thời gian thực
          </li>
          <li>
            <FontAwesomeIcon icon={faCircleCheck} /> Giỏ hàng lưu 7 ngày trên mọi thiết bị
          </li>
          <li>
            <FontAwesomeIcon icon={faCircleCheck} /> Tự hủy đơn khi chưa được xác nhận
          </li>
        </ul>
      </div>

      <div className="auth-form">
        {session ? (
          <>
            <h1>Xin chào, {session.user.fullName}</h1>
            <p className="muted">{session.user.email}</p>
            <div className="row" style={{ marginTop: 20 }}>
              <Link className="btn" href="/orders">
                <FontAwesomeIcon icon={faReceipt} /> Đơn hàng của tôi
              </Link>
              <button className="btn btn-ghost" onClick={() => void logout()}>
                <FontAwesomeIcon icon={faRightFromBracket} /> Đăng xuất
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h1>
            <p className="muted">{mode === 'login' ? 'Đăng nhập để đặt hàng và theo dõi đơn.' : 'Chỉ mất 30 giây để bắt đầu mua sắm.'}</p>
            <div className="segmented" role="tablist">
              <button
                role="tab"
                aria-selected={mode === 'login'}
                className={mode === 'login' ? 'active' : undefined}
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
              >
                Đăng nhập
              </button>
              <button
                role="tab"
                aria-selected={mode === 'register'}
                className={mode === 'register' ? 'active' : undefined}
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
              >
                Đăng ký
              </button>
            </div>
            <form className="form" onSubmit={submit} key={mode}>
              {mode === 'register' && (
                <label className="field">
                  Họ và tên
                  <span className="input-wrap">
                    <FontAwesomeIcon icon={faUser} />
                    <input className="input" name="fullName" autoComplete="name" minLength={2} maxLength={100} required />
                  </span>
                </label>
              )}
              <label className="field">
                Email
                <span className="input-wrap">
                  <FontAwesomeIcon icon={faEnvelope} />
                  <input className="input" name="email" type="email" autoComplete="email" maxLength={254} required />
                </span>
              </label>
              <label className="field">
                Mật khẩu
                <PasswordInput name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : 1} />
                {mode === 'register' && <small className="muted">Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số</small>}
              </label>
              {mode === 'register' && (
                <label className="field">
                  Nhập lại mật khẩu
                  <PasswordInput name="confirm" autoComplete="new-password" minLength={8} />
                </label>
              )}
              {error && (
                <p className="alert" role="alert">
                  <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
                </p>
              )}
              <button className="btn btn-lg btn-block" type="submit" disabled={busy}>
                {busy && <FontAwesomeIcon icon={faSpinner} spin />}
                {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
