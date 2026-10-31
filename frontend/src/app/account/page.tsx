'use client';

import { faFacebookF, faGoogle } from '@fortawesome/free-brands-svg-icons';
import {
  faCalendar,
  faCircleCheck,
  faEnvelope,
  faGauge,
  faKey,
  faLink,
  faReceipt,
  faRightFromBracket,
  faShieldHalved,
  faSpinner,
  faTriangleExclamation,
  faUserGear,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { PasswordField, isStrongPassword } from '@/components/auth/PasswordField';
import { RequireAuth } from '@/components/RequireAuth';
import { OAUTH_ERROR_VI, apiFetch, logout, saveSession } from '@/lib/client-api';
import { formatDay, initials, type AccountProfile, type AuthResponse } from '@/lib/types';

const PROVIDERS = [
  { id: 'GOOGLE', slug: 'google', label: 'Google', icon: faGoogle },
  { id: 'FACEBOOK', slug: 'facebook', label: 'Facebook', icon: faFacebookF },
] as const;

function PasswordCard({ profile, onChanged }: { profile: AccountProfile; onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isStrongPassword(next)) {
      setMsg({ ok: false, text: 'Mật khẩu mới cần ít nhất 8 ký tự gồm chữ hoa, chữ thường và chữ số' });
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
      setMsg({ ok: true, text: 'Đã cập nhật mật khẩu. Các thiết bị khác đã được đăng xuất.' });
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">
        <span className="fa-icon-wrap">
          <FontAwesomeIcon icon={faKey} />
        </span>
        {profile.hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
      </h2>
      {!profile.hasPassword && (
        <p className="muted small">Bạn đang đăng nhập bằng mạng xã hội. Đặt mật khẩu để có thể đăng nhập bằng email.</p>
      )}
      <form className="form" onSubmit={submit}>
        {profile.hasPassword && (
          <PasswordField name="current" label="Mật khẩu hiện tại" autoComplete="current-password" value={current} onChange={setCurrent} />
        )}
        <PasswordField name="new" label="Mật khẩu mới" autoComplete="new-password" value={next} onChange={setNext} showStrength minLength={8} />
        {msg && (
          <p className={msg.ok ? 'alert alert-ok' : 'alert'} role="status">
            <FontAwesomeIcon icon={msg.ok ? faCircleCheck : faTriangleExclamation} /> {msg.text}
          </p>
        )}
        <button className="btn" disabled={busy}>
          {busy && <FontAwesomeIcon icon={faSpinner} spin />} {profile.hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
        </button>
      </form>
    </section>
  );
}

function AccountContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const code = params.get('oauth_error');
    return code ? (OAUTH_ERROR_VI[code] ?? 'Liên kết tài khoản thất bại') : null;
  });

  const load = useCallback(() => {
    apiFetch<AccountProfile>('/auth/me')
      .then(setProfile)
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  async function link(slug: string) {
    setLinking(slug);
    try {
      const { ticket } = await apiFetch<{ ticket: string }>('/auth/oauth/link-ticket', { method: 'POST' });
      window.location.assign(`/api/auth/oauth/${slug}?link=${encodeURIComponent(ticket)}&next=${encodeURIComponent('/account')}`);
    } catch (err) {
      setError((err as Error).message);
      setLinking(null);
    }
  }

  if (!profile) {
    return error ? (
      <p className="alert">{error}</p>
    ) : (
      <div className="skeleton">
        <FontAwesomeIcon icon={faSpinner} spin /> Đang tải tài khoản…
      </div>
    );
  }

  return (
    <div className="account-layout">
      <aside className="panel account-card">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar avatar-xl" src={profile.avatarUrl} alt="" width={96} height={96} referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar avatar-xl">{initials(profile.fullName)}</span>
        )}
        <h2>{profile.fullName}</h2>
        <span className={`badge ${profile.role === 'ADMIN' ? 'status-shipping' : 'badge-ok'}`}>
          <FontAwesomeIcon icon={profile.role === 'ADMIN' ? faShieldHalved : faCircleCheck} />{' '}
          {profile.role === 'ADMIN' ? 'Quản trị viên' : 'Khách hàng'}
        </span>
        <ul className="account-meta">
          <li>
            <FontAwesomeIcon icon={faEnvelope} fixedWidth /> {profile.email}
          </li>
          <li>
            <FontAwesomeIcon icon={faCalendar} fixedWidth /> Thành viên từ {formatDay(profile.createdAt)}
          </li>
        </ul>
        <div className="stack" style={{ gap: 8, width: '100%' }}>
          <Link className="btn btn-ghost btn-block" href="/orders">
            <FontAwesomeIcon icon={faReceipt} /> Đơn hàng của tôi
          </Link>
          {profile.role === 'ADMIN' && (
            <Link className="btn btn-ghost btn-block" href="/admin">
              <FontAwesomeIcon icon={faGauge} /> Trang quản trị
            </Link>
          )}
          <button
            className="btn btn-ghost btn-block"
            onClick={async () => {
              await logout();
              router.push('/');
            }}
          >
            <FontAwesomeIcon icon={faRightFromBracket} /> Đăng xuất
          </button>
        </div>
      </aside>

      <div className="stack">
        {error && (
          <p className="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        <section className="panel">
          <h2 className="panel-title">
            <span className="fa-icon-wrap">
              <FontAwesomeIcon icon={faLink} />
            </span>
            Tài khoản liên kết
          </h2>
          <p className="muted small">Liên kết để đăng nhập nhanh bằng một cú nhấp, không cần nhớ mật khẩu.</p>
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
                    <small className="muted">{linked ? 'Đã liên kết' : 'Chưa liên kết'}</small>
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
        <PasswordCard profile={profile} onChanged={load} />
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <section>
      <h1 className="page-title">
        <FontAwesomeIcon icon={faUserGear} /> Tài khoản của tôi
      </h1>
      <RequireAuth>
        <Suspense fallback={<div className="skeleton">Đang tải…</div>}>
          <AccountContent />
        </Suspense>
      </RequireAuth>
    </section>
  );
}
