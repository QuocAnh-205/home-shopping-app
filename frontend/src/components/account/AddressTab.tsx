'use client';

import {
  faBuilding,
  faCircleCheck,
  faCrosshairs,
  faHouse,
  faMapLocationDot,
  faPlus,
  faSpinner,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/client-api';
import { formatAddress, type Address, type AddressInput, type AddressType, type Province, type ReverseGeocode, type Ward } from '@/lib/types';

// Bản đồ chỉ chạy trên trình duyệt (Leaflet cần window)
const AddressMap = dynamic(() => import('./AddressMap').then((m) => m.AddressMap), { ssr: false });

const EMPTY: AddressInput = { fullName: '', phone: '', provinceCode: null, wardCode: null, latitude: null, longitude: null, street: '', type: 'HOME', isDefault: false };

type GeoMsg = { tone: 'ok' | 'warn' | 'error'; text: string } | null;

/** Thông báo dễ hiểu cho từng lỗi định vị (kèm cách bật GPS / quyền vị trí) */
function geoErrorText(code: number): string {
  if (code === 1) {
    return 'Bạn đang chặn quyền vị trí. Bấm biểu tượng ổ khóa cạnh thanh địa chỉ → Vị trí → Cho phép, rồi bấm lại "Dùng vị trí hiện tại". Trên điện thoại, kiểm tra thêm Cài đặt → Quyền riêng tư → Định vị.';
  }
  if (code === 2) return 'Chưa lấy được vị trí. Hãy bật GPS / Định vị (Location) trên thiết bị, ra gần cửa sổ rồi thử lại.';
  return 'Định vị quá lâu. Hãy bật GPS / Định vị trên thiết bị rồi thử lại, hoặc chọn vị trí trên bản đồ.';
}

let provinceCache: Promise<Province[]> | null = null;
const wardCache = new Map<number, Promise<Ward[]>>();

/** Danh mục tỉnh/xã (đơn vị hành chính 2 cấp) – tải 1 lần, dùng lại giữa các lần mở form */
function useLocations(provinceCode: number | null) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  useEffect(() => {
    provinceCache ??= apiFetch<Province[]>('/locations/provinces').catch((err) => {
      provinceCache = null;
      throw err;
    });
    provinceCache.then(setProvinces).catch(() => setProvinces([]));
  }, []);
  useEffect(() => {
    if (!provinceCode) {
      setWards([]);
      return;
    }
    let active = true;
    if (!wardCache.has(provinceCode)) wardCache.set(provinceCode, apiFetch<Ward[]>(`/locations/provinces/${provinceCode}/wards`));
    wardCache
      .get(provinceCode)!
      .then((w) => active && setWards(w))
      .catch(() => {
        wardCache.delete(provinceCode);
        if (active) setWards([]);
      });
    return () => {
      active = false;
    };
  }, [provinceCode]);
  return { provinces, wards };
}

function AddressDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: Address | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<AddressInput>(() =>
    initial
      ? {
          fullName: initial.fullName,
          phone: initial.phone,
          provinceCode: initial.provinceCode,
          wardCode: initial.wardCode,
          latitude: initial.latitude,
          longitude: initial.longitude,
          street: initial.street,
          type: initial.type,
          isDefault: initial.isDefault,
        }
      : EMPTY,
  );
  const { provinces, wards } = useLocations(form.provinceCode);
  const [showMap, setShowMap] = useState(Boolean(initial?.latitude));
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState<GeoMsg>(null);
  const position = form.latitude != null && form.longitude != null ? { lat: form.latitude, lng: form.longitude } : null;

  /** Tọa độ (GPS hoặc điểm chọn trên bản đồ) → gợi ý tỉnh / xã / số nhà, tên đường */
  async function applyPosition(lat: number, lng: number) {
    setForm((f) => ({ ...f, latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) }));
    setShowMap(true);
    setGeoMsg({ tone: 'ok', text: 'Đang đọc địa chỉ tại vị trí này…' });
    try {
      const r = await apiFetch<ReverseGeocode>(`/locations/reverse?lat=${lat}&lng=${lng}`);
      setForm((f) => ({
        ...f,
        provinceCode: r.provinceCode ?? f.provinceCode,
        wardCode: r.provinceCode ? r.wardCode : f.wardCode,
        street: f.street.trim() ? f.street : (r.street ?? f.street),
      }));
      if (r.provinceCode && r.wardCode) {
        setGeoMsg({ tone: 'ok', text: `Đã xác định: ${r.wardName}, ${r.provinceName}. Kiểm tra lại và điền số nhà nếu còn thiếu.` });
      } else if (r.provinceCode) {
        setGeoMsg({ tone: 'warn', text: `Đã xác định ${r.provinceName}. Vui lòng chọn Phường/Xã (bản đồ ghi nhận: ${r.display || 'không rõ'}).` });
      } else {
        setGeoMsg({ tone: 'warn', text: 'Chưa nhận ra tỉnh/thành tại vị trí này, vui lòng chọn thủ công bên dưới.' });
      }
    } catch (err) {
      setGeoMsg({ tone: 'warn', text: `${(err as Error).message}. Vị trí vẫn được lưu, hãy chọn tỉnh/xã bên dưới.` });
    }
  }

  async function locate() {
    setGeoMsg(null);
    if (!('geolocation' in navigator)) {
      setGeoMsg({ tone: 'error', text: 'Trình duyệt không hỗ trợ định vị, vui lòng chọn trên bản đồ hoặc nhập địa chỉ.' });
      return;
    }
    if (!window.isSecureContext) {
      setGeoMsg({ tone: 'error', text: 'Định vị chỉ hoạt động trên kết nối bảo mật (https).' });
      return;
    }
    try {
      const perm = await navigator.permissions?.query({ name: 'geolocation' });
      if (perm?.state === 'denied') {
        setGeoMsg({ tone: 'error', text: geoErrorText(1) });
        return;
      }
    } catch {
      /* Safari cũ không có Permissions API: hỏi trực tiếp */
    }
    setLocating(true);
    setGeoMsg({ tone: 'ok', text: 'Trình duyệt sẽ hỏi quyền truy cập vị trí – hãy chọn "Cho phép" và bật GPS nếu đang tắt.' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        void applyPosition(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocating(false);
        setGeoMsg({ tone: 'error', text: geoErrorText(err.code) });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const set = <K extends keyof AddressInput>(key: K, value: AddressInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(initial ? `/account/addresses/${initial.id}` : '/account/addresses', {
        method: initial ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="addr-title">
      <form className="form" onSubmit={submit}>
        <header className="dialog-head">
          <h3 id="addr-title">{initial ? 'Cập nhật địa chỉ' : 'Địa chỉ mới'}</h3>
          <button type="button" className="btn-icon" onClick={() => ref.current?.close()} aria-label="Đóng">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>
        <div className="form-grid">
          <label className="field">
            Họ và tên
            <input className="input" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} minLength={2} maxLength={100} required autoComplete="name" />
          </label>
          <label className="field">
            Số điện thoại
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value.replace(/[^\d]/g, ''))}
              pattern="0\d{9,10}"
              maxLength={11}
              required
              autoComplete="tel"
              placeholder="0901234567"
            />
          </label>
          <div className="field span-2 geo-box">
            <span className="field-head">Vị trí giao hàng</span>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={locate} disabled={locating}>
                <FontAwesomeIcon icon={locating ? faSpinner : faCrosshairs} spin={locating} /> Dùng vị trí hiện tại
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMap((v) => !v)} aria-expanded={showMap}>
                <FontAwesomeIcon icon={faMapLocationDot} /> {showMap ? 'Ẩn bản đồ' : 'Chọn trên bản đồ'}
              </button>
              {position && (
                <button type="button" className="link-btn small" onClick={() => setForm((f) => ({ ...f, latitude: null, longitude: null }))}>
                  Bỏ ghim
                </button>
              )}
            </div>
            {geoMsg && (
              <p className={geoMsg.tone === 'ok' ? 'alert alert-info' : 'alert'} role="status" style={{ margin: 0 }}>
                {geoMsg.text}
              </p>
            )}
            {showMap && (
              <>
                <AddressMap position={position} onPick={(lat, lng) => void applyPosition(lat, lng)} />
                <span className="muted small">Kéo ghim hoặc bấm vào bản đồ để chỉnh đúng vị trí nhà bạn. Không bắt buộc – bạn vẫn có thể chỉ nhập địa chỉ.</span>
              </>
            )}
          </div>
          {initial && !initial.provinceCode && (
            <p className="alert alert-info span-2" style={{ margin: 0 }}>
              Địa chỉ cũ: {formatAddress(initial)}. Vui lòng chọn lại Tỉnh/Thành và Phường/Xã theo đơn vị hành chính mới (từ 01/07/2025).
            </p>
          )}
          <label className="field">
            Tỉnh / Thành phố
            <select
              className="input"
              value={form.provinceCode ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, provinceCode: e.target.value ? Number(e.target.value) : null, wardCode: null }))}
              required
            >
              <option value="">— Chọn tỉnh/thành —</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Phường / Xã
            <select
              className="input"
              value={form.wardCode ?? ''}
              onChange={(e) => set('wardCode', e.target.value ? Number(e.target.value) : null)}
              disabled={!form.provinceCode || wards.length === 0}
              required
            >
              <option value="">{form.provinceCode ? '— Chọn phường/xã —' : 'Chọn tỉnh/thành trước'}</option>
              {wards.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field span-2">
            Địa chỉ cụ thể
            <input
              className="input"
              value={form.street}
              onChange={(e) => set('street', e.target.value)}
              minLength={3}
              maxLength={255}
              required
              autoComplete="street-address"
              placeholder="Số nhà, tên đường, tòa nhà…"
            />
          </label>
        </div>
        <div className="field">
          Loại địa chỉ
          <span className="seg-toggle">
            {(['HOME', 'OFFICE'] as AddressType[]).map((t) => (
              <button key={t} type="button" className={form.type === t ? 'active' : ''} aria-pressed={form.type === t} onClick={() => set('type', t)}>
                <FontAwesomeIcon icon={t === 'HOME' ? faHouse : faBuilding} /> {t === 'HOME' ? 'Nhà riêng' : 'Văn phòng'}
              </button>
            ))}
          </span>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={form.isDefault} disabled={initial?.isDefault} onChange={(e) => set('isDefault', e.target.checked)} /> Đặt làm địa chỉ mặc định
        </label>
        {error && (
          <p className="alert" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        <footer className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
            Trở lại
          </button>
          <button className="btn" disabled={busy}>
            {busy && <FontAwesomeIcon icon={faSpinner} spin />} Hoàn thành
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/** Tab "Địa chỉ của tôi": danh sách địa chỉ giao hàng, thêm / sửa / xóa / đặt mặc định */
export function AddressTab() {
  const [items, setItems] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<Address[]>('/account/addresses')
      .then(setItems)
      .catch((err: Error) => setMsg({ ok: false, text: err.message }));
  }, []);
  useEffect(load, [load]);

  async function act(id: string, path: string, method: string, done: string) {
    setPending(id);
    setMsg(null);
    try {
      setItems(await apiFetch<Address[]>(path, { method }));
      setMsg({ ok: true, text: done });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="panel acc-panel">
      <header className="acc-head acc-head-row">
        <div>
          <h2>Địa chỉ của tôi</h2>
          <p className="muted">Địa chỉ mặc định được điền sẵn khi đặt hàng</p>
        </div>
        <button className="btn" onClick={() => setEditing('new')} disabled={items !== null && items.length >= 10}>
          <FontAwesomeIcon icon={faPlus} /> Thêm địa chỉ mới
        </button>
      </header>

      {msg && (
        <p className={msg.ok ? 'alert alert-ok' : 'alert'} role="status">
          <FontAwesomeIcon icon={msg.ok ? faCircleCheck : faTriangleExclamation} /> {msg.text}
        </p>
      )}

      {items === null ? (
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải địa chỉ…
        </div>
      ) : items.length === 0 ? (
        <div className="acc-empty">
          <strong>Bạn chưa có địa chỉ nào</strong>
          <p className="muted">Thêm địa chỉ để thanh toán nhanh hơn ở lần mua sau.</p>
        </div>
      ) : (
        <ul className="addr-list">
          {items.map((a) => (
            <li key={a.id}>
              <div className="addr-info">
                <p>
                  <strong>{a.fullName}</strong>
                  <span className="addr-sep" aria-hidden>
                    |
                  </span>
                  <span className="muted">{a.phone}</span>
                </p>
                <p className="muted">{a.street}</p>
                <p className="muted">{[a.ward, a.district, a.province].filter(Boolean).join(', ')}</p>
                {!a.provinceCode && <p className="small" style={{ color: 'var(--warn)' }}>Cần cập nhật theo địa giới hành chính mới</p>}
                <p className="addr-tags">
                  {a.isDefault && <span className="badge badge-primary">Mặc định</span>}
                  <span className="badge badge-outline">
                    <FontAwesomeIcon icon={a.type === 'HOME' ? faHouse : faBuilding} /> {a.type === 'HOME' ? 'Nhà riêng' : 'Văn phòng'}
                  </span>
                </p>
              </div>
              <div className="addr-actions">
                <span>
                  <button className="link-btn" onClick={() => setEditing(a)}>
                    Cập nhật
                  </button>
                  {!a.isDefault && (
                    <button
                      className="link-btn"
                      disabled={pending === a.id}
                      onClick={() => act(a.id, `/account/addresses/${a.id}`, 'DELETE', `Đã xóa địa chỉ: ${formatAddress(a)}`)}
                    >
                      Xóa
                    </button>
                  )}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={a.isDefault || pending === a.id}
                  onClick={() => act(a.id, `/account/addresses/${a.id}/default`, 'POST', 'Đã thiết lập địa chỉ mặc định')}
                >
                  Thiết lập mặc định
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AddressDialog
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMsg({ ok: true, text: 'Đã lưu địa chỉ' });
            load();
          }}
        />
      )}
    </section>
  );
}
