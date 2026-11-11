'use client';

import { faSpinner, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client-api';
import type { AccountProfile } from '@/lib/types';

/** Đổi email 2 bước: (1) email mới + mật khẩu hiện tại → (2) nhập mã 6 số gửi tới email mới */
export function EmailChangeDialog({ profile, onClose, onChanged }: { profile: AccountProfile; onClose: () => void; onChanged: (p: AccountProfile) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function request(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/account/email/request', { method: 'POST', body: JSON.stringify({ newEmail, ...(profile.hasPassword ? { password } : {}) }) });
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChanged(await apiFetch<AccountProfile>('/account/email/confirm', { method: 'POST', body: JSON.stringify({ code }) }));
      ref.current?.close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="email-title">
      <form className="form" onSubmit={step === 1 ? request : confirm}>
        <header className="dialog-head">
          <h3 id="email-title">Đổi địa chỉ email</h3>
          <button type="button" className="btn-icon" onClick={() => ref.current?.close()} aria-label="Đóng">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>
        {step === 1 ? (
          <>
            <label className="field">
              Email mới
              <input className="input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required maxLength={254} autoComplete="email" />
            </label>
            {profile.hasPassword && (
              <label className="field">
                Mật khẩu hiện tại
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </label>
            )}
            <p className="muted small">Chúng tôi sẽ gửi mã xác nhận 6 số tới email mới để chắc chắn email này là của bạn.</p>
          </>
        ) : (
          <>
            <p>
              Mã xác nhận đã được gửi tới <strong>{newEmail}</strong> (hiệu lực 10 phút).
            </p>
            <label className="field">
              Mã xác nhận
              <input
                className="input otp-input"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoComplete="one-time-code"
                autoFocus
              />
            </label>
            <button type="button" className="link-btn small" disabled={busy} onClick={() => request()}>
              Gửi lại mã
            </button>
          </>
        )}
        {error && (
          <p className="alert" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        <footer className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={() => (step === 2 ? setStep(1) : ref.current?.close())}>
            {step === 2 ? 'Quay lại' : 'Hủy'}
          </button>
          <button className="btn" disabled={busy}>
            {busy && <FontAwesomeIcon icon={faSpinner} spin />} {step === 1 ? 'Gửi mã xác nhận' : 'Xác nhận'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
