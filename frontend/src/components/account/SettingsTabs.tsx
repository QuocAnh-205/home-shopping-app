'use client';

import { faCircleCheck, faDownload, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type ReactNode } from 'react';
import { apiFetch, getToken } from '@/lib/client-api';
import { formatDay, maskEmail, maskPhone, type AccountProfile, type UserSettings } from '@/lib/types';
import { DeleteAccountCard } from './SecurityTabs';

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: ReactNode; disabled?: boolean }) {
  return (
    <div className="setting-row">
      <span>
        <strong>{label}</strong>
        <span className="muted small">{hint}</span>
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className={checked ? 'switch on' : 'switch'} disabled={disabled} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  );
}

function useSettings(profile: AccountProfile, onSaved: (s: UserSettings) => void) {
  const [settings, setSettings] = useState(profile.settings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function update(patch: Partial<UserSettings>) {
    const prev = settings;
    setSettings({ ...settings, ...patch });
    setBusy(true);
    setMsg(null);
    try {
      const saved = await apiFetch<UserSettings>('/account/settings', { method: 'PATCH', body: JSON.stringify(patch) });
      setSettings(saved);
      onSaved(saved);
      setMsg({ ok: true, text: 'Đã lưu cài đặt' });
    } catch (err) {
      setSettings(prev);
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return { settings, update, busy, msg };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={msg.ok ? 'alert alert-ok' : 'alert'} role="status">
      <FontAwesomeIcon icon={msg.ok ? faCircleCheck : faTriangleExclamation} /> {msg.text}
    </p>
  );
}

/** Cài đặt thông báo: email cập nhật đơn hàng, email & thông báo khuyến mãi */
export function NotificationSettingsTab({ profile, onSaved }: { profile: AccountProfile; onSaved: (s: UserSettings) => void }) {
  const { settings, update, busy, msg } = useSettings(profile, onSaved);
  return (
    <section className="panel acc-panel">
      <header className="acc-head">
        <h2>Cài đặt thông báo</h2>
        <p className="muted">Chọn thông báo bạn muốn nhận qua email ({maskEmail(profile.email)}) và trong web</p>
      </header>
      <div className="settings-list">
        <Toggle
          label="Email cập nhật đơn hàng"
          hint="Đặt hàng, xác nhận, giao hàng, thanh toán, hoàn tiền"
          checked={settings.emailOrderUpdates}
          disabled={busy}
          onChange={(v) => update({ emailOrderUpdates: v })}
        />
        <Toggle
          label="Email khuyến mãi"
          hint="Voucher sắp hết hạn, ưu đãi dành riêng cho bạn"
          checked={settings.emailPromotions}
          disabled={busy}
          onChange={(v) => update({ emailPromotions: v })}
        />
        <Toggle
          label="Thông báo khuyến mãi trong web"
          hint="Hiện ở chuông thông báo (thông báo đơn hàng & thanh toán luôn được hiển thị)"
          checked={settings.inAppPromotions}
          disabled={busy}
          onChange={(v) => update({ inAppPromotions: v })}
        />
      </div>
      <Msg msg={msg} />
    </section>
  );
}

/** Những thiết lập riêng tư: ẩn tên khi đánh giá, xóa tài khoản */
export function PrivacyTab({ profile, onSaved }: { profile: AccountProfile; onSaved: (s: UserSettings) => void }) {
  const { settings, update, busy, msg } = useSettings(profile, onSaved);
  return (
    <>
      <section className="panel acc-panel">
        <header className="acc-head">
          <h2>Những thiết lập riêng tư</h2>
          <p className="muted">Kiểm soát thông tin người khác nhìn thấy về bạn</p>
        </header>
        <div className="settings-list">
          <Toggle
            label="Ẩn tên khi đánh giá sản phẩm"
            hint={`Đánh giá của bạn hiển thị dạng "${profile.fullName.trim()[0] ?? ''}***${profile.fullName.trim().slice(-1)}", không kèm ảnh đại diện`}
            checked={settings.hideNameInReviews}
            disabled={busy}
            onChange={(v) => update({ hideNameInReviews: v })}
          />
        </div>
        <Msg msg={msg} />
      </section>
      <DeleteAccountCard profile={profile} />
    </>
  );
}

/** Thông tin cá nhân: tóm tắt dữ liệu cửa hàng đang lưu + tải toàn bộ dữ liệu */
export function PersonalInfoTab({ profile }: { profile: AccountProfile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/export', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Chưa tải được dữ liệu, vui lòng thử lại sau');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `du-lieu-ca-nhan-${profile.username}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ['Tên đăng nhập', profile.username],
    ['Họ tên', profile.fullName],
    ['Email', maskEmail(profile.email)],
    ['Số điện thoại', profile.phone ? maskPhone(profile.phone) : 'Chưa cập nhật'],
    ['Ngày sinh', profile.dateOfBirth ? profile.dateOfBirth.split('-').reverse().join('/') : 'Chưa cập nhật'],
    ['Đăng nhập bằng', [profile.hasPassword ? 'Email & mật khẩu' : null, ...profile.providers.map((p) => (p === 'GOOGLE' ? 'Google' : 'Facebook'))].filter(Boolean).join(', ')],
    ['Thành viên từ', formatDay(profile.createdAt)],
  ];

  return (
    <section className="panel acc-panel">
      <header className="acc-head">
        <h2>Thông tin cá nhân</h2>
        <p className="muted">Dữ liệu cửa hàng đang lưu về bạn và quyền tải về theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân</p>
      </header>
      <dl className="summary personal-info">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">
        Bản tải về gồm hồ sơ, sổ địa chỉ, tài khoản ngân hàng, đơn hàng, đánh giá, lịch sử xu và thông báo (định dạng JSON). Mật khẩu chỉ được lưu dạng mã
        hóa một chiều nên không có trong bản tải.
      </p>
      {error && (
        <p className="alert" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
      )}
      <button className="btn" onClick={download} disabled={busy}>
        <FontAwesomeIcon icon={busy ? faSpinner : faDownload} spin={busy} /> Tải dữ liệu của tôi
      </button>
    </section>
  );
}
