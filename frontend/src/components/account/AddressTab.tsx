'use client';

import { faBuilding, faCircleCheck, faHouse, faPlus, faSpinner, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client-api';
import { formatAddress, type Address, type AddressInput, type AddressType } from '@/lib/types';

const EMPTY: AddressInput = { fullName: '', phone: '', province: '', district: '', ward: '', street: '', type: 'HOME', isDefault: false };

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
  const [form, setForm] = useState<AddressInput>(() => (initial ? { ...initial } : EMPTY));
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
    const { fullName, phone, province, district, ward, street, type, isDefault } = form;
    try {
      await apiFetch(initial ? `/account/addresses/${initial.id}` : '/account/addresses', {
        method: initial ? 'PUT' : 'POST',
        body: JSON.stringify({ fullName, phone, province, district, ward, street, type, isDefault }),
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
          <label className="field">
            Tỉnh / Thành phố
            <input className="input" value={form.province} onChange={(e) => set('province', e.target.value)} minLength={2} maxLength={100} required placeholder="TP. Hồ Chí Minh" />
          </label>
          <label className="field">
            Quận / Huyện
            <input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} minLength={2} maxLength={100} required placeholder="Quận 1" />
          </label>
          <label className="field span-2">
            Phường / Xã
            <input className="input" value={form.ward} onChange={(e) => set('ward', e.target.value)} minLength={2} maxLength={100} required placeholder="P. Bến Nghé" />
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
                <p className="muted">{[a.ward, a.district, a.province].join(', ')}</p>
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
