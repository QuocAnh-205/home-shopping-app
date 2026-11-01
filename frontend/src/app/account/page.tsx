'use client';

import {
  faGauge,
  faKey,
  faLink,
  faLocationDot,
  faPen,
  faReceipt,
  faRightFromBracket,
  faShieldHalved,
  faSpinner,
  faTriangleExclamation,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { AddressTab } from '@/components/account/AddressTab';
import { ProfileTab } from '@/components/account/ProfileTab';
import { DeleteAccountCard, LinkedTab, PasswordTab } from '@/components/account/SecurityTabs';
import { RequireAuth } from '@/components/RequireAuth';
import { OAUTH_ERROR_VI, apiFetch, logout } from '@/lib/client-api';
import { formatDay, initials, type AccountProfile } from '@/lib/types';

const TABS = [
  { id: 'profile', label: 'Hồ sơ', icon: faUser },
  { id: 'address', label: 'Địa chỉ', icon: faLocationDot },
  { id: 'password', label: 'Đổi mật khẩu', icon: faKey },
  { id: 'linked', label: 'Liên kết tài khoản', icon: faLink },
] as const;
type TabId = (typeof TABS)[number]['id'];

function isTab(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

function AccountContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: TabId = isTab(params.get('tab')) ? (params.get('tab') as TabId) : 'profile';
  const [profile, setProfile] = useState<AccountProfile | null>(null);
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

  const go = (id: TabId) => router.replace(id === 'profile' ? '/account' : `/account?tab=${id}`, { scroll: false });

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
    <div className="acc-layout">
      <aside className="acc-side" aria-label="Menu tài khoản">
        <div className="acc-user">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar avatar-img" src={profile.avatarUrl} alt="" width={48} height={48} referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar">{initials(profile.fullName)}</span>
          )}
          <span>
            <strong>{profile.fullName}</strong>
            <button className="link-btn muted" onClick={() => go('profile')}>
              <FontAwesomeIcon icon={faPen} /> Sửa hồ sơ
            </button>
          </span>
        </div>

        <nav className="acc-nav">
          <p className="acc-nav-group">
            <FontAwesomeIcon icon={faUser} fixedWidth /> Tài khoản của tôi
          </p>
          <ul>
            {TABS.map((t) => (
              <li key={t.id}>
                <button className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                  <FontAwesomeIcon icon={t.icon} fixedWidth /> {t.label}
                </button>
              </li>
            ))}
          </ul>
          <Link className="acc-nav-group" href="/orders">
            <FontAwesomeIcon icon={faReceipt} fixedWidth /> Đơn mua
          </Link>
          {profile.role === 'ADMIN' && (
            <Link className="acc-nav-group" href="/admin">
              <FontAwesomeIcon icon={faGauge} fixedWidth /> Trang quản trị
            </Link>
          )}
          <button
            className="acc-nav-group"
            onClick={async () => {
              await logout();
              router.push('/');
            }}
          >
            <FontAwesomeIcon icon={faRightFromBracket} fixedWidth /> Đăng xuất
          </button>
        </nav>

        <p className="acc-since muted small">
          {profile.role === 'ADMIN' && (
            <>
              <FontAwesomeIcon icon={faShieldHalved} /> Quản trị viên ·{' '}
            </>
          )}
          Thành viên từ {formatDay(profile.createdAt)}
        </p>
      </aside>

      <div className="acc-main">
        {error && (
          <p className="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        {tab === 'profile' && <ProfileTab key={profile.id} profile={profile} onSaved={setProfile} />}
        {tab === 'address' && <AddressTab />}
        {tab === 'password' && <PasswordTab profile={profile} onChanged={load} />}
        {tab === 'password' && <DeleteAccountCard profile={profile} />}
        {tab === 'linked' && <LinkedTab profile={profile} onError={setError} />}
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <section>
      <RequireAuth>
        <Suspense fallback={<div className="skeleton">Đang tải…</div>}>
          <AccountContent />
        </Suspense>
      </RequireAuth>
    </section>
  );
}
