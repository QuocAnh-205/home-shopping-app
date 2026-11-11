'use client';

import { faCamera, faCircleCheck, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { apiFetch, updateSessionUser } from '@/lib/client-api';
import { EmailChangeDialog } from './EmailChangeDialog';
import { initials, maskEmail, maskPhone, type AccountProfile, type Gender } from '@/lib/types';

const AVATAR_MAX_BYTES = 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const GENDERS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Nam' },
  { value: 'FEMALE', label: 'Nữ' },
  { value: 'OTHER', label: 'Khác' },
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year || 2000, month || 1, 0)).getUTCDate();
}

/** Tab "Hồ sơ của tôi": form thông tin bên trái, ảnh đại diện bên phải (bố cục giống Shopee) */
export function ProfileTab({ profile, onSaved }: { profile: AccountProfile; onSaved: (p: AccountProfile) => void }) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [editPhone, setEditPhone] = useState(!profile.phone);
  const [gender, setGender] = useState<Gender | null>(profile.gender);
  const [dob, setDob] = useState(() => {
    const [y, m, d] = (profile.dateOfBirth ?? '').split('-').map(Number);
    return { d: d || 0, m: m || 0, y: y || 0 };
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(profile.username);
  const [changingEmail, setChangingEmail] = useState(false);

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 10 - 1900 + 1 }, (_, i) => thisYear - 10 - i);
  const maxDay = daysInMonth(dob.y, dob.m);

  async function save(e: FormEvent) {
    e.preventDefault();
    const dobParts = [dob.d, dob.m, dob.y];
    if (dobParts.some(Boolean) && !dobParts.every(Boolean)) {
      setMsg({ ok: false, text: 'Vui lòng chọn đủ ngày, tháng, năm sinh' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // Tên đăng nhập chỉ đổi được 1 lần: gửi riêng, chỉ khi khách thật sự sửa
      if (profile.usernameChangeable && username.trim().toLowerCase() !== profile.username) {
        await apiFetch<AccountProfile>('/account/username', { method: 'PATCH', body: JSON.stringify({ username: username.trim().toLowerCase() }) });
      }
      const updated = await apiFetch<AccountProfile>('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          phone: phone.trim() || null,
          gender,
          dateOfBirth: dob.y ? `${dob.y}-${String(dob.m).padStart(2, '0')}-${String(Math.min(dob.d, maxDay)).padStart(2, '0')}` : null,
        }),
      });
      updateSessionUser({ fullName: updated.fullName });
      setEditPhone(!updated.phone);
      onSaved(updated);
      setMsg({ ok: true, text: 'Cập nhật hồ sơ thành công' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      setMsg({ ok: false, text: 'Chỉ chấp nhận ảnh định dạng .JPEG, .PNG hoặc .WEBP' });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setMsg({ ok: false, text: 'Dung lượng ảnh tối đa 1 MB' });
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const updated = await apiFetch<AccountProfile>('/account/avatar', { method: 'POST', body });
      updateSessionUser({ avatarUrl: updated.avatarUrl });
      onSaved(updated);
      setMsg({ ok: true, text: 'Đã cập nhật ảnh đại diện' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="panel acc-panel">
      <header className="acc-head">
        <h2>Hồ sơ của tôi</h2>
        <p className="muted">Quản lý thông tin hồ sơ để bảo mật tài khoản</p>
      </header>

      <div className="acc-profile">
        <form className="acc-form" onSubmit={save}>
          <div className="acc-row">
            <span className="acc-label">Tên đăng nhập</span>
            {profile.usernameChangeable ? (
              <span className="acc-field">
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                  minLength={4}
                  maxLength={30}
                  pattern="[a-z0-9._]{4,30}"
                  aria-label="Tên đăng nhập"
                />
                <small className="muted">Tên đăng nhập chỉ có thể thay đổi một lần.</small>
              </span>
            ) : (
              <span className="acc-value">{profile.username}</span>
            )}
          </div>
          <div className="acc-row">
            <span className="acc-label">Email</span>
            <span className="acc-value">
              {maskEmail(profile.email)}
              <button type="button" className="link-btn" onClick={() => setChangingEmail(true)}>
                Thay đổi
              </button>
            </span>
          </div>
          <label className="acc-row">
            <span className="acc-label">Tên</span>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} maxLength={100} required autoComplete="name" />
          </label>
          <div className="acc-row">
            <span className="acc-label">Số điện thoại</span>
            {editPhone ? (
              <input
                className="input"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))}
                pattern="0\d{9,10}"
                maxLength={11}
                placeholder="VD: 0901234567"
                autoComplete="tel"
                aria-label="Số điện thoại"
              />
            ) : (
              <span className="acc-value">
                {maskPhone(phone)}
                <button type="button" className="link-btn" onClick={() => setEditPhone(true)}>
                  Thay đổi
                </button>
              </span>
            )}
          </div>
          <div className="acc-row" role="radiogroup" aria-label="Giới tính">
            <span className="acc-label">Giới tính</span>
            <span className="acc-radios">
              {GENDERS.map((g) => (
                <label key={g.value} className="radio">
                  <input type="radio" name="gender" checked={gender === g.value} onChange={() => setGender(g.value)} /> {g.label}
                </label>
              ))}
            </span>
          </div>
          <div className="acc-row">
            <span className="acc-label">Ngày sinh</span>
            <span className="acc-dob">
              <select className="input" aria-label="Ngày" value={dob.d} onChange={(e) => setDob({ ...dob, d: Number(e.target.value) })}>
                <option value={0}>Ngày</option>
                {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select className="input" aria-label="Tháng" value={dob.m} onChange={(e) => setDob({ ...dob, m: Number(e.target.value) })}>
                <option value={0}>Tháng</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
              <select className="input" aria-label="Năm" value={dob.y} onChange={(e) => setDob({ ...dob, y: Number(e.target.value) })}>
                <option value={0}>Năm</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </span>
          </div>
          {msg && (
            <p className={msg.ok ? 'alert alert-ok acc-msg' : 'alert acc-msg'} role="status">
              <FontAwesomeIcon icon={msg.ok ? faCircleCheck : faTriangleExclamation} /> {msg.text}
            </p>
          )}
          <div className="acc-row">
            <span className="acc-label" />
            <button className="btn" disabled={busy}>
              {busy && <FontAwesomeIcon icon={faSpinner} spin />} Lưu
            </button>
          </div>
        </form>

        {changingEmail && (
          <EmailChangeDialog
            profile={profile}
            onClose={() => setChangingEmail(false)}
            onChanged={(p) => {
              onSaved(p);
              setMsg({ ok: true, text: 'Đã đổi email đăng nhập' });
            }}
          />
        )}

        <div className="acc-avatar">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar avatar-img acc-avatar-img" src={profile.avatarUrl} alt="Ảnh đại diện" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar acc-avatar-img">{initials(profile.fullName)}</span>
          )}
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden onChange={upload} />
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <FontAwesomeIcon icon={uploading ? faSpinner : faCamera} spin={uploading} /> Chọn ảnh
          </button>
          <p className="muted small">
            Dung lượng file tối đa 1 MB
            <br />
            Định dạng: .JPEG, .PNG, .WEBP
          </p>
        </div>
      </div>
    </section>
  );
}
