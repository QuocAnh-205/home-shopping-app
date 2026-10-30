'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { apiFetch, logout, saveSession, useSession } from '@/lib/client-api';
import type { AuthResponse } from '@/lib/types';

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

  if (!ready) return <div className="skeleton">Đang tải…</div>;

  if (session) {
    return (
      <div className="panel auth-card center">
        <h1>Xin chào, {session.user.fullName}</h1>
        <p className="muted">{session.user.email}</p>
        <div className="row-gap">
          <Link className="btn" href="/orders">
            Đơn hàng của tôi
          </Link>
          <button className="btn btn-ghost" onClick={() => void logout()}>
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel auth-card">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => { setMode('login'); setError(null); }}>
          Đăng nhập
        </button>
        <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => { setMode('register'); setError(null); }}>
          Đăng ký
        </button>
      </div>
      <form className="form" onSubmit={submit} key={mode}>
        {mode === 'register' && (
          <label>
            <span>Họ và tên</span>
            <input className="input" name="fullName" autoComplete="name" minLength={2} maxLength={100} required />
          </label>
        )}
        <label>
          <span>Email</span>
          <input className="input" name="email" type="email" autoComplete="email" maxLength={254} required />
        </label>
        <label>
          <span>Mật khẩu</span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : 1}
            maxLength={72}
            required
          />
          {mode === 'register' && <small className="muted">Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số</small>}
        </label>
        {mode === 'register' && (
          <label>
            <span>Nhập lại mật khẩu</span>
            <input className="input" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
          </label>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-lg" type="submit" disabled={busy}>
          {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="skeleton">Đang tải…</div>}>
      <LoginForm />
    </Suspense>
  );
}
