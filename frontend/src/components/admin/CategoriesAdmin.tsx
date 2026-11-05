'use client';

import { faFloppyDisk, faFolderTree, faPen, faPlus, faTrashCan, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { slugify, type AdminCategory } from '@/lib/admin';
import { apiFetch } from '@/lib/client-api';
import { ConfirmButton, Loading, Notice } from './ui';

function CategoryForm({ initial, onSubmit, onCancel, submitLabel }: { initial?: AdminCategory; onSubmit: (v: { name: string; slug: string }) => Promise<void>; onCancel?: () => void; submitLabel: string }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [touched, setTouched] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), slug });
      if (!initial) {
        setName('');
        setSlug('');
        setTouched(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cat-form" onSubmit={submit}>
      <input
        className="input input-sm"
        placeholder="Tên danh mục"
        value={name}
        minLength={2}
        maxLength={80}
        required
        onChange={(e) => {
          setName(e.target.value);
          if (!touched) setSlug(slugify(e.target.value).slice(0, 80));
        }}
      />
      <input
        className="input input-sm"
        placeholder="slug-url"
        value={slug}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        maxLength={80}
        required
        title="Chỉ chữ thường không dấu, số và dấu gạch ngang"
        onChange={(e) => {
          setSlug(e.target.value);
          setTouched(true);
        }}
      />
      <button className="btn btn-sm" disabled={busy}>
        <FontAwesomeIcon icon={initial ? faFloppyDisk : faPlus} /> {submitLabel}
      </button>
      {onCancel && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          <FontAwesomeIcon icon={faXmark} /> Hủy
        </button>
      )}
    </form>
  );
}

export function CategoriesAdmin() {
  const [items, setItems] = useState<AdminCategory[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<AdminCategory[]>('/admin/categories')
      .then(setItems)
      .catch((err: Error) => setMessage({ ok: false, text: err.message }));
  }, []);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: ok });
      setEditing(null);
      load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
      throw err;
    }
  }

  return (
    <div className="stack">
      <div className="panel">
        <h2 className="panel-title">
          <span className="fa-icon-wrap">
            <FontAwesomeIcon icon={faPlus} />
          </span>
          Thêm danh mục
        </h2>
        <CategoryForm
          submitLabel="Thêm"
          onSubmit={(v) => run(() => apiFetch('/admin/categories', { method: 'POST', body: JSON.stringify(v) }), `Đã thêm danh mục "${v.name}"`).catch(() => undefined)}
        />
      </div>
      <Notice message={message} onClose={() => setMessage(null)} />
      <div className="panel">
        <h2 className="panel-title">
          <span className="fa-icon-wrap">
            <FontAwesomeIcon icon={faFolderTree} />
          </span>
          Danh mục ({items?.length ?? 0})
        </h2>
        {!items ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Danh mục</th>
                  <th className="num">Sản phẩm</th>
                  <th className="num">Đang bán</th>
                  <th className="num">Tồn kho</th>
                  <th className="num">Đã bán</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((c) =>
                  editing === c.id ? (
                    <tr key={c.id}>
                      <td colSpan={6}>
                        <CategoryForm
                          initial={c}
                          submitLabel="Lưu"
                          onCancel={() => setEditing(null)}
                          onSubmit={(v) => run(() => apiFetch(`/admin/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify(v) }), 'Đã lưu danh mục').catch(() => undefined)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td>
                        <b>{c.name}</b>
                        <div className="muted small">/{c.slug}</div>
                      </td>
                      <td className="num">{c.productCount}</td>
                      <td className="num">{c.activeCount}</td>
                      <td className="num">{c.stock.toLocaleString('vi-VN')}</td>
                      <td className="num">{c.soldCount.toLocaleString('vi-VN')}</td>
                      <td className="actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c.id)}>
                          <FontAwesomeIcon icon={faPen} /> Sửa
                        </button>
                        <ConfirmButton
                          label="Xóa"
                          confirmLabel="Chắc chắn xóa?"
                          icon={faTrashCan}
                          disabled={c.productCount > 0}
                          onConfirm={() => run(() => apiFetch(`/admin/categories/${c.id}`, { method: 'DELETE' }), `Đã xóa danh mục "${c.name}"`).catch(() => undefined)}
                        />
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <p className="muted small">Chỉ xóa được danh mục không còn sản phẩm. Hãy chuyển sản phẩm sang danh mục khác trước (Sản phẩm → Sửa).</p>
          </div>
        )}
      </div>
    </div>
  );
}
