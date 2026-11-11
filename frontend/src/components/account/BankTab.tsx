'use client';

import { faBuildingColumns, faCircleCheck, faPlus, faSpinner, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client-api';
import type { BankAccount } from '@/lib/types';

const MAX_BANKS = 5;

function AddBankDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (list: BankAccount[]) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [catalog, setCatalog] = useState<{ bin: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    apiFetch<{ bin: string; name: string }[]>('/account/banks/catalog')
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const list = await apiFetch<BankAccount[]>('/account/banks', {
        method: 'POST',
        body: JSON.stringify({ bankBin: f.get('bankBin'), accountNo: f.get('accountNo'), holderName: f.get('holderName'), isDefault: f.get('isDefault') === 'on' }),
      });
      onSaved(list);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="bank-title">
      <form className="form" onSubmit={submit}>
        <header className="dialog-head">
          <h3 id="bank-title">Thêm tài khoản ngân hàng</h3>
          <button type="button" className="btn-icon" onClick={() => ref.current?.close()} aria-label="Đóng">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>
        <label className="field">
          Ngân hàng
          <select className="input" name="bankBin" required defaultValue="">
            <option value="" disabled>
              — Chọn ngân hàng —
            </option>
            {catalog.map((b) => (
              <option key={b.bin} value={b.bin}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Số tài khoản
          <input className="input" name="accountNo" inputMode="numeric" pattern="[\d ]{6,23}" maxLength={23} required placeholder="VD: 0123456789" />
        </label>
        <label className="field">
          Tên chủ tài khoản
          <input className="input" name="holderName" required minLength={3} maxLength={100} placeholder="NGUYEN VAN A" style={{ textTransform: 'uppercase' }} />
          <small className="muted">Ghi đúng như trên thẻ, không dấu – dùng để cửa hàng chuyển tiền hoàn cho bạn.</small>
        </label>
        <label className="checkbox">
          <input type="checkbox" name="isDefault" /> Đặt làm tài khoản mặc định
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

/** Ngân hàng: tài khoản nhận tiền hoàn (đơn chuyển khoản / COD được duyệt trả hàng) */
export function BankTab() {
  const [items, setItems] = useState<BankAccount[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<BankAccount[]>('/account/banks')
      .then(setItems)
      .catch((err: Error) => setMsg({ ok: false, text: err.message }));
  }, []);
  useEffect(load, [load]);

  async function act(path: string, method: string, done: string) {
    setMsg(null);
    try {
      setItems(await apiFetch<BankAccount[]>(path, { method }));
      setMsg({ ok: true, text: done });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <section className="panel acc-panel">
      <header className="acc-head acc-head-row">
        <div>
          <h2>Tài khoản ngân hàng của tôi</h2>
          <p className="muted">Nhận tiền hoàn khi đơn thanh toán bằng chuyển khoản hoặc COD được duyệt trả hàng</p>
        </div>
        <button className="btn" onClick={() => setAdding(true)} disabled={items !== null && items.length >= MAX_BANKS}>
          <FontAwesomeIcon icon={faPlus} /> Thêm ngân hàng liên kết
        </button>
      </header>

      {msg && (
        <p className={msg.ok ? 'alert alert-ok' : 'alert'} role="status">
          <FontAwesomeIcon icon={msg.ok ? faCircleCheck : faTriangleExclamation} /> {msg.text}
        </p>
      )}

      {items === null ? (
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải…
        </div>
      ) : items.length === 0 ? (
        <div className="acc-empty">
          <FontAwesomeIcon icon={faBuildingColumns} size="2x" className="muted" />
          <strong>Bạn chưa có tài khoản ngân hàng</strong>
          <p className="muted">Thêm tài khoản để nhận tiền hoàn nhanh hơn khi trả hàng.</p>
        </div>
      ) : (
        <ul className="addr-list">
          {items.map((b) => (
            <li key={b.id}>
              <div className="addr-info">
                <p>
                  <FontAwesomeIcon icon={faBuildingColumns} /> <strong>{b.bankName}</strong>
                  {b.isDefault && <span className="badge badge-primary">Mặc định</span>}
                </p>
                <p className="muted">
                  {b.holderName} · {b.accountNoMasked}
                </p>
              </div>
              <div className="addr-actions">
                {!b.isDefault && (
                  <button className="link-btn" onClick={() => act(`/account/banks/${b.id}`, 'DELETE', 'Đã xóa tài khoản ngân hàng')}>
                    Xóa
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" disabled={b.isDefault} onClick={() => act(`/account/banks/${b.id}/default`, 'POST', 'Đã đặt làm mặc định')}>
                  Thiết lập mặc định
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddBankDialog
          onClose={() => setAdding(false)}
          onSaved={(list) => {
            setItems(list);
            setAdding(false);
            setMsg({ ok: true, text: 'Đã thêm tài khoản ngân hàng' });
          }}
        />
      )}
    </section>
  );
}
