'use client';

import {
  faBell,
  faCoins,
  faGauge,
  faPen,
  faReceipt,
  faRightFromBracket,
  faShieldHalved,
  faSpinner,
  faTag,
  faTicket,
  faTriangleExclamation,
  faUser,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { AddressTab } from '@/components/account/AddressTab';
import { BankTab } from '@/components/account/BankTab';
import { NotificationsTab } from '@/components/account/NotificationsTab';
import { ProfileTab } from '@/components/account/ProfileTab';
import { LinkedTab, PasswordTab } from '@/components/account/SecurityTabs';
import { NotificationSettingsTab, PersonalInfoTab, PrivacyTab } from '@/components/account/SettingsTabs';
import { CoinsTab, VoucherWalletTab } from '@/components/account/WalletTabs';
import { RequireAuth } from '@/components/RequireAuth';
import { OAUTH_ERROR_VI, apiFetch, logout, useUnreadNotifications } from '@/lib/client-api';
import { formatDay, initials, type AccountProfile, type Address } from '@/lib/types';

/** Mục con của "Tài khoản của tôi" (thứ tự giống các sàn TMĐT quen thuộc) */
const ACCOUNT_TABS = [
  { id: 'profile', label: 'Hồ sơ' },
  { id: 'bank', label: 'Ngân hàng' },
  { id: 'address', label: 'Địa chỉ' },
  { id: 'password', label: 'Đổi mật khẩu' },
  { id: 'notify-settings', label: 'Cài đặt thông báo' },
  { id: 'privacy', label: 'Những thiết lập riêng tư' },
  { id: 'personal', label: 'Thông tin cá nhân' },
  { id: 'linked', label: 'Liên kết tài khoản' },
] as const;
const OTHER_TABS = ['notifications', 'vouchers', 'coins'] as const;
type TabId = (typeof ACCOUNT_TABS)[number]['id'] | (typeof OTHER_TABS)[number];

function isTab(value: string | null): value is TabId {
  return ACCOUNT_TABS.some((t) => t.id === value) || (OTHER_TABS as readonly string[]).includes(value ?? '');
}

const BANNER_KEY = 'hs_address_banner_dismissed';

function AccountContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: TabId = isTab(params.get('tab')) ? (params.get('tab') as TabId) : 'profile';
  const unread = useUnreadNotifications();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [legacyAddresses, setLegacyAddresses] = useState(0);
  const [banner, setBanner] = useState(false);
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

  // Banner địa chỉ theo địa giới hành chính mới: luôn hiện nếu còn địa chỉ cũ; không thì hiện 1 lần (đóng được)
  useEffect(() => {
    apiFetch<Address[]>('/account/addresses')
      .then((list) => {
        const legacy = list.filter((a) => !a.provinceCode).length;
        setLegacyAddresses(legacy);
        let dismissed = false;
        try {
          dismissed = localStorage.getItem(BANNER_KEY) === '1';
        } catch {
          /* storage bị chặn */
        }
        setBanner(legacy > 0 || (list.length > 0 && !dismissed));
      })
      .catch(() => setBanner(false));
  }, [tab]);

  const go = (id: TabId) => router.replace(id === 'profile' ? '/account' : `/account?tab=${id}`, { scroll: false });
  const inAccountGroup = ACCOUNT_TABS.some((t) => t.id === tab);

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
            <strong title={profile.username}>{profile.username}</strong>
            <button className="link-btn muted" onClick={() => go('profile')}>
              <FontAwesomeIcon icon={faPen} /> Sửa hồ sơ
            </button>
          </span>
        </div>

        <nav className="acc-nav">
          <Link className="acc-nav-group" href="/?sale=1#products">
            <FontAwesomeIcon icon={faTag} fixedWidth className="acc-nav-sale" /> Ưu đãi hôm nay <span className="badge-new">New</span>
          </Link>
          <button className={`acc-nav-group ${tab === 'notifications' ? 'active' : ''}`} onClick={() => go('notifications')}>
            <FontAwesomeIcon icon={faBell} fixedWidth /> Thông báo
            {unread.total > 0 && <span className="badge-count inline">{unread.total > 99 ? '99+' : unread.total}</span>}
          </button>

          <button className={`acc-nav-group ${inAccountGroup ? 'active' : ''}`} onClick={() => go('profile')} aria-expanded={inAccountGroup}>
            <FontAwesomeIcon icon={faUser} fixedWidth /> Tài khoản của tôi
          </button>
          {inAccountGroup && (
            <ul>
              {ACCOUNT_TABS.map((t) => (
                <li key={t.id}>
                  <button className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link className="acc-nav-group" href="/orders">
            <FontAwesomeIcon icon={faReceipt} fixedWidth /> Đơn mua
          </Link>
          <button className={`acc-nav-group ${tab === 'vouchers' ? 'active' : ''}`} onClick={() => go('vouchers')}>
            <FontAwesomeIcon icon={faTicket} fixedWidth /> Kho voucher
          </button>
          <button className={`acc-nav-group ${tab === 'coins' ? 'active' : ''}`} onClick={() => go('coins')}>
            <FontAwesomeIcon icon={faCoins} fixedWidth className="acc-nav-coin" /> Xu của tôi
            <span className="muted small acc-nav-meta">{profile.coinBalance.toLocaleString('vi-VN')}</span>
          </button>
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
        {banner && tab !== 'address' && (
          <div className="acc-banner" role="status">
            <FontAwesomeIcon icon={faBell} />
            <span>
              {legacyAddresses > 0
                ? `${legacyAddresses} địa chỉ chưa theo đơn vị hành chính mới (34 tỉnh, từ 01/07/2025). `
                : 'Địa chỉ đã được cập nhật theo thông tin hành chính mới. '}
              <button className="link-btn" onClick={() => go('address')}>
                Kiểm tra ngay
              </button>
            </span>
            {legacyAddresses === 0 && (
              <button
                className="btn-icon"
                aria-label="Đóng thông báo"
                onClick={() => {
                  setBanner(false);
                  try {
                    localStorage.setItem(BANNER_KEY, '1');
                  } catch {
                    /* storage bị chặn */
                  }
                }}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'profile' && <ProfileTab key={`${profile.id}-${profile.email}-${profile.username}`} profile={profile} onSaved={setProfile} />}
        {tab === 'bank' && <BankTab />}
        {tab === 'address' && <AddressTab />}
        {tab === 'password' && <PasswordTab profile={profile} onChanged={load} />}
        {tab === 'notify-settings' && <NotificationSettingsTab profile={profile} onSaved={(settings) => setProfile({ ...profile, settings })} />}
        {tab === 'privacy' && <PrivacyTab profile={profile} onSaved={(settings) => setProfile({ ...profile, settings })} />}
        {tab === 'personal' && <PersonalInfoTab profile={profile} />}
        {tab === 'linked' && <LinkedTab profile={profile} onError={setError} />}
        {tab === 'vouchers' && <VoucherWalletTab />}
        {tab === 'coins' && <CoinsTab />}
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
