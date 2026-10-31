'use client';

import { faEnvelope, faSpinner, faTriangleExclamation, faUser, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiFetch, saveSession } from '@/lib/client-api';
import type { AuthResponse } from '@/lib/types';
import { safeNext } from './LoginForm';
import { PasswordField, isStrongPassword } from './PasswordField';
import { SocialButtons } from './SocialButtons';

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const target = safeNext(params.get('next'));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!isStrongPassword(password)) {
      setError('Mật khẩu chưa đủ mạnh: cần ít nhất 8 ký tự gồm chữ hoa, chữ thường và chữ số');
      return;
    }
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const auth = await apiFetch<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ fullName: form.get('fullName'), email: form.get('email'), password }),
      });
      saveSession(auth);
      router.push(target);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Tạo tài khoản</h1>
      <p className="muted">Chỉ mất 30 giây – hoặc dùng tài khoản Google/Facebook có sẵn.</p>

      <SocialButtons mode="register" next={target} />
      <div className="divider-text">
        <span>hoặc đăng ký bằng email</span>
      </div>

      <form className="form" onSubmit={submit}>
        <label className="field">
          Họ và tên
          <span className="input-wrap">
            <FontAwesomeIcon icon={faUser} />
            <input className="input" name="fullName" autoComplete="name" minLength={2} maxLength={100} required placeholder="Nguyễn Văn A" />
          </span>
        </label>
        <label className="field">
          Email
          <span className="input-wrap">
            <FontAwesomeIcon icon={faEnvelope} />
            <input className="input" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="ban@email.com" />
          </span>
        </label>
        <PasswordField name="password" label="Mật khẩu" autoComplete="new-password" value={password} onChange={setPassword} showStrength minLength={8} />
        <PasswordField name="confirm" label="Nhập lại mật khẩu" autoComplete="new-password" value={confirm} onChange={setConfirm} minLength={8} />
        {confirm && confirm !== password && <small className="danger">Mật khẩu nhập lại chưa khớp</small>}
        <label className="checkbox">
          <input type="checkbox" required /> Tôi đồng ý với điều khoản sử dụng và chính sách bảo mật
        </label>
        {error && (
          <p className="alert" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        <button className="btn btn-lg btn-block" type="submit" disabled={busy}>
          <FontAwesomeIcon icon={busy ? faSpinner : faUserPlus} spin={busy} />
          {busy ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
        </button>
      </form>
      <p className="auth-switch">
        Đã có tài khoản?{' '}
        <Link className="link" href={`/login${target !== '/' ? `?next=${encodeURIComponent(target)}` : ''}`}>
          Đăng nhập
        </Link>
      </p>
    </>
  );
}
