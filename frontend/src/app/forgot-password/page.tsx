'use client';

import { faArrowLeft, faEnvelope, faEnvelopeCircleCheck, faPaperPlane, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { apiFetch } from '@/lib/client-api';

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setSentTo(email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell image="/images/site/cat-trang-tri.webp">
      {sentTo ? (
        <div className="auth-done">
          <span className="success-ico">
            <FontAwesomeIcon icon={faEnvelopeCircleCheck} />
          </span>
          <h1>Kiểm tra hộp thư của bạn</h1>
          <p>
            Nếu <strong>{sentTo}</strong> đã đăng ký tại Home Shopping, bạn sẽ nhận được email chứa liên kết đặt lại mật khẩu trong vài
            phút.
          </p>
          <p className="muted small">Liên kết có hiệu lực 30 phút và chỉ dùng được một lần. Nhớ kiểm tra cả thư mục Spam.</p>
          <div className="row row-center">
            <button className="btn btn-ghost" onClick={() => setSentTo(null)}>
              Gửi lại
            </button>
            <Link className="btn" href="/login">
              Về trang đăng nhập
            </Link>
          </div>
        </div>
      ) : (
        <>
          <h1>Quên mật khẩu?</h1>
          <p className="muted">Nhập email bạn đã dùng để đăng ký, chúng tôi sẽ gửi liên kết tạo mật khẩu mới.</p>
          <form className="form" onSubmit={submit} style={{ marginTop: 20 }}>
            <label className="field">
              Email
              <span className="input-wrap">
                <FontAwesomeIcon icon={faEnvelope} />
                <input className="input" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="ban@email.com" />
              </span>
            </label>
            {error && (
              <p className="alert" role="alert">
                <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
              </p>
            )}
            <button className="btn btn-lg btn-block" disabled={busy}>
              <FontAwesomeIcon icon={busy ? faSpinner : faPaperPlane} spin={busy} />
              {busy ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}
            </button>
          </form>
          <p className="auth-switch">
            <Link className="link" href="/login">
              <FontAwesomeIcon icon={faArrowLeft} /> Quay lại đăng nhập
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
