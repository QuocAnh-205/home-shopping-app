'use client';

import {
  faBoxesStacked,
  faBoxOpen,
  faCircleExclamation,
  faEye,
  faEyeSlash,
  faFloppyDisk,
  faMagnifyingGlass,
  faPen,
  faPlus,
  faSpinner,
  faTags,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { ProductImage } from '@/components/ProductImage';
import { slugify, toQuery, type AdminProduct, type AdminProductPage } from '@/lib/admin';
import { apiFetch } from '@/lib/client-api';
import { formatPrice, type Category } from '@/lib/types';
import { StockEditor } from './StockEditor';
import { AdminDialog, ConfirmButton, Loading, Notice, Pager, StatTile, useDebounced } from './ui';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function specsToText(specs: Record<string, string> | undefined): string {
  return Object.entries(specs ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function textToSpecs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().slice(0, 60);
    const v = line.slice(i + 1).trim().slice(0, 200);
    if (k && v) out[k] = v;
  }
  return out;
}

/** Form dùng chung cho Thêm và Sửa sản phẩm */
function ProductForm({ product, categories, onSaved }: { product?: AdminProduct; categories: Category[]; onSaved: (msg: string) => void }) {
  const editing = Boolean(product);
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get('image');
    const hasFile = file instanceof File && file.size > 0;
    if (!editing && !hasFile) return setError('Vui lòng chọn ảnh sản phẩm');
    if (hasFile && (file.size > 5 * 1024 * 1024 || !IMAGE_TYPES.includes(file.type))) return setError('Ảnh phải là JPEG/PNG/WEBP và tối đa 5MB');

    const compare = String(form.get('compareAtPrice') ?? '').trim();
    const payload = {
      name: name.trim(),
      slug,
      description: String(form.get('description') ?? ''),
      price: String(form.get('price')),
      compareAtPrice: compare || null,
      stock: Number(form.get('stock')),
      categoryId: Number(form.get('categoryId')),
      isHot: form.get('isHot') === 'on',
      highlights: String(form.get('highlights') ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 10),
      specs: textToSpecs(String(form.get('specs') ?? '')),
    };

    setBusy(true);
    setError(null);
    try {
      const saved = await apiFetch<AdminProduct>(editing ? `/products/${product!.id}` : '/products', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      if (hasFile) {
        const upload = new FormData();
        upload.set('file', file);
        try {
          await apiFetch(`/products/${saved.id}/image`, { method: 'POST', body: upload });
        } catch (err) {
          onSaved(`Đã lưu "${saved.name}" nhưng tải ảnh lỗi: ${(err as Error).message}`);
          return;
        }
      }
      onSaved(editing ? `Đã lưu thay đổi "${saved.name}"` : `Đã tạo sản phẩm "${saved.name}"`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form form-grid" onSubmit={submit}>
      {product && (
        <div className="span-2 cell-product">
          <span className="thumb-md">
            <ProductImage product={product} />
          </span>
          <span className="muted small">
            Đã bán {product.soldCount} · {product.ratingCount} đánh giá ({product.ratingAvg.toFixed(1)}★)
          </span>
        </div>
      )}
      <label>
        <span>Tên sản phẩm</span>
        <input
          className="input"
          value={name}
          minLength={2}
          maxLength={200}
          required
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </label>
      <label>
        <span>Slug (URL)</span>
        <input
          className="input"
          value={slug}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={200}
          required
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
        />
      </label>
      <label>
        <span>Giá bán (VND)</span>
        <input className="input" name="price" type="number" min={0} step={1000} defaultValue={product ? Number(product.price) : undefined} required />
      </label>
      <label>
        <span>Giá gốc trước giảm (để trống nếu không giảm)</span>
        <input className="input" name="compareAtPrice" type="number" min={0} step={1000} defaultValue={product?.compareAtPrice ? Number(product.compareAtPrice) : undefined} />
      </label>
      <label>
        <span>Tồn kho</span>
        <input className="input" name="stock" type="number" min={0} max={1_000_000} defaultValue={product?.stock ?? 10} required />
      </label>
      <label>
        <span>Danh mục</span>
        <select className="input" name="categoryId" defaultValue={product?.categoryId} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="span-2">
        <span>{editing ? 'Thay ảnh (để trống nếu giữ ảnh cũ)' : 'Ảnh sản phẩm (bắt buộc)'} – JPEG/PNG/WEBP ≤ 5MB</span>
        <input className="input" name="image" type="file" accept={IMAGE_TYPES.join(',')} required={!editing} />
      </label>
      <label className="span-2">
        <span>Mô tả</span>
        <textarea className="input" name="description" rows={4} maxLength={8000} defaultValue={product?.description} required />
      </label>
      <label>
        <span>Điểm nổi bật (mỗi dòng 1 ý, tối đa 10)</span>
        <textarea className="input" name="highlights" rows={4} maxLength={2000} defaultValue={product?.highlights.join('\n')} />
      </label>
      <label>
        <span>Thông số kỹ thuật (mỗi dòng “Nhãn: Giá trị”)</span>
        <textarea className="input" name="specs" rows={4} maxLength={4000} defaultValue={specsToText(product?.specs)} placeholder={'Công suất: 1500W\nDung tích: 5L'} />
      </label>
      <label className="checkbox">
        <input type="checkbox" name="isHot" defaultChecked={product?.isHot} /> Đánh dấu bán chạy
      </label>
      <button className="btn" disabled={busy}>
        <FontAwesomeIcon icon={busy ? faSpinner : editing ? faFloppyDisk : faPlus} spin={busy} />
        {busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
      </button>
      {error && (
        <div className="span-2">
          <Notice message={{ ok: false, text: error }} />
        </div>
      )}
    </form>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <input
      type="checkbox"
      className="switch"
      checked={checked}
      disabled={busy}
      aria-label={label}
      onChange={async (e) => {
        setBusy(true);
        try {
          await onChange(e.target.checked);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function ProductsAdmin() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [data, setData] = useState<AdminProductPage | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const [onSale, setOnSale] = useState(false);
  const [sort, setSort] = useState('newest');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; product: AdminProduct } | null>(null);
  const dq = useDebounced(q);
  const query = toQuery({ q: dq.trim(), categoryId, status, stock, onSale: onSale || undefined, sort });

  const load = useCallback(() => {
    apiFetch<AdminProductPage>(`/admin/products?${query}&page=${page}&limit=20`)
      .then(setData)
      .catch((err: Error) => setMessage({ ok: false, text: err.message }));
  }, [query, page]);

  useEffect(() => {
    apiFetch<Category[]>('/categories').then(setCategories).catch(() => setCategories([]));
  }, []);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [query]);

  async function patch(p: AdminProduct, path: string, body: unknown, ok: string) {
    try {
      await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
      setMessage({ ok: true, text: ok });
      load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
  }

  const c = data?.counts;
  return (
    <div className="stack">
      <div className="stat-tiles">
        <StatTile icon={faTags} tone="ico-blue" label="Tất cả" value={c?.all ?? '…'} active={!status && !stock} onClick={() => { setStatus(''); setStock(''); }} />
        <StatTile icon={faEye} tone="ico-green" label="Đang bán" value={c?.active ?? '…'} active={status === 'active'} onClick={() => { setStatus('active'); setStock(''); }} />
        <StatTile icon={faEyeSlash} tone="ico-violet" label="Đang ẩn" value={c?.hidden ?? '…'} active={status === 'hidden'} onClick={() => { setStatus('hidden'); setStock(''); }} />
        <StatTile icon={faCircleExclamation} tone="ico-orange" label="Sắp hết (≤10)" value={c?.low ?? '…'} active={stock === 'low'} onClick={() => { setStatus(''); setStock('low'); setSort('stock_asc'); }} />
        <StatTile icon={faBoxOpen} tone="ico-orange" label="Hết hàng" value={c?.out ?? '…'} active={stock === 'out'} onClick={() => { setStatus(''); setStock('out'); }} />
      </div>

      <div className="panel">
        <div className="admin-toolbar">
          <span className="input-wrap grow">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input className="input input-sm" type="search" placeholder="Tìm theo tên hoặc slug…" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
          <select className="input input-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Danh mục">
            <option value="">Mọi danh mục</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select className="input input-sm" value={stock} onChange={(e) => setStock(e.target.value)} aria-label="Tồn kho">
            <option value="">Mọi tồn kho</option>
            <option value="in">Còn hàng</option>
            <option value="low">Sắp hết (≤10)</option>
            <option value="out">Hết hàng</option>
          </select>
          <select className="input input-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sắp xếp">
            <option value="newest">Mới nhất</option>
            <option value="name">Tên A→Z</option>
            <option value="price_asc">Giá tăng dần</option>
            <option value="price_desc">Giá giảm dần</option>
            <option value="stock_asc">Tồn kho ít nhất</option>
            <option value="best_selling">Bán chạy nhất</option>
            <option value="top_rated">Đánh giá cao nhất</option>
          </select>
          <label className="checkbox small">
            <input type="checkbox" checked={onSale} onChange={(e) => setOnSale(e.target.checked)} /> Đang giảm giá
          </label>
          <button className="btn btn-sm" onClick={() => setDialog({ mode: 'create' })} disabled={categories.length === 0}>
            <FontAwesomeIcon icon={faPlus} /> Thêm sản phẩm
          </button>
        </div>
        <Notice message={message} onClose={() => setMessage(null)} />
        {!data ? (
          <Loading label="Đang tải sản phẩm…" />
        ) : data.items.length === 0 ? (
          <EmptyState icon={faBoxesStacked} title="Không có sản phẩm phù hợp">
            <p>Thử đổi bộ lọc hoặc thêm sản phẩm mới.</p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Danh mục</th>
                  <th className="num">Giá</th>
                  <th>Tồn kho</th>
                  <th className="num">Đã bán</th>
                  <th className="num">Đánh giá</th>
                  <th>Bán chạy</th>
                  <th>Hiển thị</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className={p.isActive ? '' : 'row-muted'}>
                    <td>
                      <span className="cell-product">
                        <span className="thumb-sm">
                          <ProductImage product={p} />
                        </span>
                        <span>
                          {p.isActive ? (
                            <a className="link" href={`/products/${p.slug}`} target="_blank" rel="noreferrer">
                              {p.name}
                            </a>
                          ) : (
                            <b>{p.name}</b>
                          )}
                          <div className="muted small">
                            /{p.slug} {!p.isActive && <span className="badge badge-muted">Đang ẩn</span>}
                          </div>
                        </span>
                      </span>
                    </td>
                    <td className="small">{p.category.name}</td>
                    <td className="num">
                      <b>{formatPrice(p.price)}</b>
                      {p.compareAtPrice && (
                        <div className="small muted">
                          <s>{formatPrice(p.compareAtPrice)}</s> −{p.discountPercent}%
                        </div>
                      )}
                    </td>
                    <td>
                      <StockEditor key={`${p.id}-${p.stock}`} productId={p.id} stock={p.stock} onSaved={load} />
                    </td>
                    <td className="num">{p.soldCount}</td>
                    <td className="num small">{p.ratingCount ? `${p.ratingAvg.toFixed(1)}★ (${p.ratingCount})` : '—'}</td>
                    <td>
                      <Toggle checked={p.isHot} label={`Bán chạy: ${p.name}`} onChange={(v) => patch(p, `/products/${p.id}`, { isHot: v }, v ? `Đã đánh dấu bán chạy "${p.name}"` : `Đã bỏ đánh dấu bán chạy "${p.name}"`)} />
                    </td>
                    <td>
                      <Toggle checked={p.isActive} label={`Hiển thị: ${p.name}`} onChange={(v) => patch(p, `/admin/products/${p.id}/active`, { isActive: v }, v ? `Đã hiện "${p.name}" trên cửa hàng` : `Đã ẩn "${p.name}" khỏi cửa hàng`)} />
                    </td>
                    <td className="actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ mode: 'edit', product: p })}>
                        <FontAwesomeIcon icon={faPen} /> Sửa
                      </button>
                      <ConfirmButton
                        label="Xóa"
                        confirmLabel="Xóa hẳn?"
                        icon={faTrashCan}
                        onConfirm={async () => {
                          try {
                            await apiFetch(`/admin/products/${p.id}`, { method: 'DELETE' });
                            setMessage({ ok: true, text: `Đã xóa "${p.name}"` });
                            load();
                          } catch (err) {
                            setMessage({ ok: false, text: (err as Error).message });
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} totalPages={data.totalPages} total={data.total} unit="sản phẩm" onPage={setPage} />}
      </div>

      <AdminDialog title={dialog?.mode === 'edit' ? 'Sửa sản phẩm' : 'Thêm sản phẩm'} open={dialog !== null} onClose={() => setDialog(null)} wide>
        {dialog && (
          <ProductForm
            key={dialog.mode === 'edit' ? dialog.product.id : 'new'}
            product={dialog.mode === 'edit' ? dialog.product : undefined}
            categories={categories}
            onSaved={(msg) => {
              setDialog(null);
              setMessage({ ok: !msg.includes('lỗi'), text: msg });
              load();
            }}
          />
        )}
      </AdminDialog>
    </div>
  );
}
