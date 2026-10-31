'use client';

import { faFacebookF, faGoogle } from '@fortawesome/free-brands-svg-icons';
import { faCircleCheck, faLink, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type FormEvent } from 'react';
import { PasswordField, isStrongPassword } from '@/components/auth/PasswordField';
import { apiFetch, saveSession } from '@/lib/client-api';
import type { AccountProfile, AuthResponse } from '@/lib/types';

const PROVIDERS = [
  { id: 'GOOGLE', slug: 'google', label: 'Google', icon: faGoogle },
  { id: 'FACEBOOK', slug: 'facebook', label: 'Facebook', icon: faFacebookF },
] as const;

/** Tab "Đổi mật khẩu" (hoặc "Đặt mật khẩu" cho tài khoản chỉ đăng nhập bằng mạng xã hội) */
export function PasswordTab({ profile, onChanged }: { profile: AccountProfile; onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isStrongPassword(next)) {
      setMsg({ ok: false, text: 'Mật khẩu mới cần ít nhất 8 ký tự gồm chữ hoa, chữ thường và chữ số' });
      return;
    }
    if (next !== confirm) {
      setMsg({ ok: false, text: 'Mật khẩu xác nhận không khớp' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const auth = await apiFetch<AuthResponse>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ ...(profile.hasPassword ? { currentPassword: current } : {}), newPassword: next }),
      });
      saveSession(auth);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMsg({ ok: true, text: 'Đã cập nhật mật khẩu. Các thiết bị khác đã được đăng xuất.' });
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel acc-panel">
      <header className="acc-head">
        <h2>{profile.hasPassword ? 'Đổi mật khẩu' : 'Thiết lập mật khẩu'}</h2>
        <p className="muted">
          {profile.hasPassword
            ? 'Để bảo mật tài khoản, vui lòng không chia sẻ mật khẩu cho người khác'
            : 'Bạn đang đăng nhập bằng mạng xã hội. Đặt mật khẩu để có thể đăng nhập bằng email.'}
        </p>
      </header>
      <form className="form acc-narrow" onSubmit={submit}>
        {profile.hasPassword && (
          <PasswordField name="current" label="Mật khẩu hiện tại" autoComplete="current-password" value={current} onChange={setCurrent} />
        )}
        <PasswordField name="new" label="Mật khẩu mới" autoComplete="new-password" value={next} onChange={setNext} showStrength minLength={8} />
        <PasswordField name="confirm" label="Xác nhận mật khẩu" autoComplete="new-password" value={confirm} onChange={setConfirm} minLength={8} />
        {msg && (
          <p className={msg.ok ? 'alert alert-ok' : 'alert'} role="status">
            <FontAwesomeIcon icon={msg.ok ? faCircleCheck : faTriangleExclamation} /> {msg.text}
          </p>
        )}
        <div>
          <button className="btn" disabled={busy}>
            {busy && <FontAwesomeIcon icon={faSpinner} spin />} Xác nhận
          </button>
        </div>
      </form>
    </section>
  );
}

/** Tab "Liên kết tài khoản" Google / Facebook */
export function LinkedTab({ profile, onError }: { profile: AccountProfile; onError: (message: string) => void }) {
  const [linking, setLinking] = useState<string | null>(null);

  async function link(slug: string) {
    setLinking(slug);
    try {
      const { ticket } = await apiFetch<{ ticket: string }>('/auth/oauth/link-ticket', { method: 'POST' });
      window.location.assign(`/api/auth/oauth/${slug}?link=${encodeURIComponent(ticket)}&next=${encodeURIComponent('/account?tab=linked')}`);
    } catch (err) {
      onError((err as Error).message);
      setLinking(null);
    }
  }

  return (
    <section className="panel acc-panel">
      <header className="acc-head">
        <h2>Liên kết tài khoản</h2>
        <p className="muted">Liên kết để đăng nhập nhanh bằng một cú nhấp, không cần nhớ mật khẩu</p>
      </header>
      <ul className="linked-list">
        {PROVIDERS.map((p) => {
          const linked = profile.providers.includes(p.id);
          return (
            <li key={p.id}>
              <span className={`provider-ico provider-${p.slug}`}>
                <FontAwesomeIcon icon={p.icon} />
              </span>
              <span>
                <strong>{p.label}</strong>
                <small className="muted">{linked ? 'Đã liên kết với tài khoản này' : 'Chưa liên kết'}</small>
              </span>
              {linked ? (
                <span className="badge badge-ok">
                  <FontAwesomeIcon icon={faCircleCheck} /> Đã liên kết
                </span>
              ) : (
                <button className="btn btn-ghost btn-sm" disabled={linking !== null} onClick={() => link(p.slug)}>
                  {linking === p.slug ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faLink} />} Liên kết
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
