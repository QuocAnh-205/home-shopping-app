'use client';

import { faKey, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { PasswordField, isStrongPassword } from '@/components/auth/PasswordField';
import { apiFetch, saveSession } from '@/lib/client-api';

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!TOKEN_RE.test(token)) {
    return (
      <div className="auth-done">
        <h1>Liên kết không hợp lệ</h1>
        <p className="muted">Liên kết đặt lại mật khẩu bị thiếu hoặc sai định dạng.</p>
        <Link className="btn" href="/forgot-password">
          Yêu cầu liên kết mới
        </Link>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isStrongPassword(password)) {
      setError('Mật khẩu cần ít nhất 8 ký tự gồm chữ hoa, chữ thường và chữ số');
      return;
    }
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      // Mọi phiên cũ đã bị thu hồi ở server → xóa phiên local và đăng nhập lại
      saveSession(null);
      router.replace('/login?reset=1');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Tạo mật khẩu mới</h1>
      <p className="muted">Sau khi đổi, mọi thiết bị đang đăng nhập sẽ bị đăng xuất để bảo vệ tài khoản.</p>
      <form className="form" onSubmit={submit} style={{ marginTop: 20 }}>
        <PasswordField name="password" label="Mật khẩu mới" autoComplete="new-password" value={password} onChange={setPassword} showStrength minLength={8} />
        <PasswordField name="confirm" label="Nhập lại mật khẩu mới" autoComplete="new-password" value={confirm} onChange={setConfirm} minLength={8} />
        {error && (
          <p className="alert" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> <span>{error}</span>
          </p>
        )}
        <button className="btn btn-lg btn-block" disabled={busy}>
          <FontAwesomeIcon icon={busy ? faSpinner : faKey} spin={busy} /> Đặt lại mật khẩu
        </button>
      </form>
      {error?.includes('hết hạn') && (
        <p className="auth-switch">
          <Link className="link" href="/forgot-password">
            Yêu cầu liên kết mới
          </Link>
        </p>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell image="/images/site/cat-trang-tri.webp">
      <Suspense fallback={<div className="skeleton">Đang tải…</div>}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
