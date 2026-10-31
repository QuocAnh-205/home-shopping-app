'use client';

import {
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faMagnifyingGlass,
  faPlus,
  faSpinner,
  faTags,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client-api';
import { ProductImage } from '@/components/ProductImage';
import { formatPrice, type Category, type Product, type ProductPage } from '@/lib/types';
import { StockEditor } from './StockEditor';

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

function CreateProductForm({ categories, onCreated }: { categories: Category[]; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const file = form.get('image');
    // Sản phẩm luôn phải có ảnh thật (không dùng icon thay ảnh) → kiểm tra trước khi tạo
    if (!(file instanceof File) || file.size === 0) {
      setMessage({ ok: false, text: 'Vui lòng chọn ảnh sản phẩm' });
      return;
    }
    if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage({ ok: false, text: 'Ảnh phải là JPEG/PNG/WEBP và tối đa 5MB' });
      return;
    }
    const compare = String(form.get('compareAtPrice') ?? '').trim();
    const highlights = String(form.get('highlights') ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10);
    setBusy(true);
    setMessage(null);
    try {
      const product = await apiFetch<Product>('/products', {
        method: 'POST',
        body: JSON.stringify({
          name,
          slug,
          description: form.get('description'),
          price: String(form.get('price')),
          compareAtPrice: compare || null,
          highlights,
          stock: Number(form.get('stock')),
          categoryId: Number(form.get('categoryId')),
          isHot: form.get('isHot') === 'on',
        }),
      });
      const upload = new FormData();
      upload.set('file', file);
      try {
        await apiFetch(`/products/${product.id}/image`, { method: 'POST', body: upload });
      } catch (err) {
        setMessage({ ok: false, text: `Đã tạo sản phẩm nhưng tải ảnh lỗi: ${(err as Error).message}. Hãy thử tải lại ảnh.` });
        onCreated();
        return;
      }
      setMessage({ ok: true, text: `Đã tạo "${product.name}"` });
      formEl.reset();
      setName('');
      setSlug('');
      setSlugTouched(false);
      onCreated();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form form-grid" onSubmit={submit}>
      <h2 className="span-2 panel-title" style={{ margin: 0 }}>
        <span className="fa-icon-wrap">
          <FontAwesomeIcon icon={faPlus} />
        </span>
        Thêm sản phẩm
      </h2>
      <label>
        <span>Tên sản phẩm</span>
        <input
          className="input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          minLength={2}
          maxLength={200}
          required
        />
      </label>
      <label>
        <span>Slug (URL)</span>
        <input
          className="input"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          required
        />
      </label>
      <label>
        <span>Giá bán (VND)</span>
        <input className="input" name="price" type="number" min={0} step={1000} required />
      </label>
      <label>
        <span>Giá gốc trước giảm (để trống nếu không giảm)</span>
        <input className="input" name="compareAtPrice" type="number" min={0} step={1000} />
      </label>
      <label>
        <span>Tồn kho</span>
        <input className="input" name="stock" type="number" min={0} max={1_000_000} defaultValue={10} required />
      </label>
      <label>
        <span>Danh mục</span>
        <select className="input" name="categoryId" required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Ảnh sản phẩm (bắt buộc, JPEG/PNG/WEBP ≤ 5MB)</span>
        <input className="input" name="image" type="file" accept="image/jpeg,image/png,image/webp" required />
      </label>
      <label className="span-2">
        <span>Mô tả</span>
        <textarea className="input" name="description" rows={4} maxLength={8000} required />
      </label>
      <label className="span-2">
        <span>Điểm nổi bật (mỗi dòng 1 ý, tối đa 10)</span>
        <textarea className="input" name="highlights" rows={3} maxLength={2000} />
      </label>
      <label className="checkbox">
        <input type="checkbox" name="isHot" /> Đánh dấu bán chạy
      </label>
      <button className="btn" disabled={busy}>
        <FontAwesomeIcon icon={busy ? faSpinner : faPlus} spin={busy} />
        {busy ? 'Đang lưu…' : 'Tạo sản phẩm'}
      </button>
      {message && (
        <p className={`span-2 alert ${message.ok ? 'alert-ok' : ''}`}>
          <FontAwesomeIcon icon={message.ok ? faCircleCheck : faTriangleExclamation} /> {message.text}
        </p>
      )}
    </form>
  );
}

function HotToggle({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <input
      type="checkbox"
      className="switch"
      checked={product.isHot}
      disabled={busy}
      aria-label={`Bán chạy: ${product.name}`}
      onChange={async (e) => {
        setBusy(true);
        try {
          await apiFetch(`/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ isHot: e.target.checked }) });
          onSaved();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function ProductsAdmin() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [data, setData] = useState<ProductPage | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), limit: '20', sort: 'name' });
    if (q.trim()) qs.set('q', q.trim());
    apiFetch<ProductPage>(`/products?${qs}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [page, q]);

  useEffect(() => {
    apiFetch<Category[]>('/categories').then(setCategories).catch(() => setCategories([]));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="stack">
      {categories.length > 0 && <CreateProductForm categories={categories} onCreated={load} />}
      <div className="panel">
        <div className="page-head">
          <h2 className="panel-title" style={{ margin: 0 }}>
            <span className="fa-icon-wrap">
              <FontAwesomeIcon icon={faTags} />
            </span>
            Danh sách sản phẩm
          </h2>
          <span className="input-wrap">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
          <input
            className="input input-sm"
            type="search"
            placeholder="Lọc theo tên…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          </span>
        </div>
        {error && (
          <p className="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        {!data ? (
          <div className="skeleton">
            <FontAwesomeIcon icon={faSpinner} spin /> Đang tải…
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Danh mục</th>
                  <th>Giá</th>
                  <th>Bán chạy</th>
                  <th>Tồn kho</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="cell-product">
                        <span className="thumb-sm">
                          <ProductImage product={p} />
                        </span>
                        <a className="link" href={`/products/${p.slug}`} target="_blank" rel="noreferrer">
                          {p.name}
                        </a>
                      </span>
                    </td>
                    <td>{p.category.name}</td>
                    <td>{formatPrice(p.price)}</td>
                    <td>
                      <HotToggle product={p} onSaved={load} />
                    </td>
                    <td>
                      <StockEditor key={`${p.id}-${p.stock}`} productId={p.id} stock={p.stock} onSaved={load} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.totalPages > 1 && (
          <nav className="pagination">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <FontAwesomeIcon icon={faChevronLeft} /> Trước
            </button>
            <span className="muted">
              Trang {data.page}/{data.totalPages}
            </span>
            <button className="btn btn-ghost" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              Sau <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
