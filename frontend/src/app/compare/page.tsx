'use client';

import { faCodeCompare, faSpinner, faTruck, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { PriceTag } from '@/components/PriceTag';
import { Stars } from '@/components/Stars';
import { apiFetch } from '@/lib/client-api';
import { clearCompare, removeCompare, useCompare } from '@/lib/compare';
import { formatCapacity, formatDimensions, formatWarranty, type Product } from '@/lib/types';

interface Row {
  label: string;
  values: (string | null)[];
}

/** Hàng thông số chuẩn hóa trước, sau đó toàn bộ thông số riêng của từng sản phẩm (gộp theo nhãn) */
function buildRows(products: Product[]): Row[] {
  const fixed: Row[] = [
    { label: 'Danh mục', values: products.map((p) => p.category?.name ?? null) },
    { label: 'Chất liệu chính', values: products.map((p) => p.material) },
    { label: 'Công suất', values: products.map((p) => (p.powerW ? `${p.powerW.toLocaleString('vi-VN')} W` : null)) },
    { label: 'Dung tích', values: products.map((p) => formatCapacity(p.capacityMl)) },
    { label: 'Kích thước (D × R × C)', values: products.map((p) => formatDimensions(p)) },
    { label: 'Bảo hành', values: products.map((p) => formatWarranty(p.warrantyMonths)) },
    { label: 'Giao hàng', values: products.map((p) => (p.isBulky ? 'Hàng cồng kềnh · lắp đặt tận nơi' : 'Giao nhanh tiêu chuẩn')) },
    { label: 'Tình trạng', values: products.map((p) => (p.stock > 0 ? `Còn ${p.stock} sản phẩm` : 'Hết hàng')) },
  ];
  const skip = /^(bảo hành|kích thước|chất liệu|công suất|dung tích|giao hàng)$/i;
  const keys = [...new Set(products.flatMap((p) => Object.keys(p.specs ?? {})))].filter((k) => !skip.test(k));
  const specRows = keys.map((k) => ({ label: k, values: products.map((p) => p.specs?.[k] ?? null) }));
  return [...fixed, ...specRows].filter((r) => r.values.some((v) => v));
}

export default function ComparePage() {
  const list = useCompare();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const slugs = list.map((i) => i.slug).join(',');

  useEffect(() => {
    if (!slugs) {
      setProducts([]);
      return;
    }
    setError(null);
    apiFetch<Product[]>(`/products/compare?slugs=${encodeURIComponent(slugs)}`)
      .then(setProducts)
      .catch((err: Error) => setError(err.message));
  }, [slugs]);

  const rows = useMemo(() => {
    const all = products ? buildRows(products) : [];
    return onlyDiff ? all.filter((r) => new Set(r.values.map((v) => v ?? '–')).size > 1) : all;
  }, [products, onlyDiff]);

  const cheapest = products?.length ? Math.min(...products.map((p) => p.price)) : 0;

  return (
    <section>
      <h1 className="page-title">
        <FontAwesomeIcon icon={faCodeCompare} /> So sánh sản phẩm
      </h1>

      {error && <p className="alert">{error}</p>}
      {!products ? (
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải…
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={faCodeCompare} title="Chưa có sản phẩm nào để so sánh">
          <p>Mở trang sản phẩm và bấm &quot;So sánh&quot; (tối đa 4 món) để đặt cạnh nhau về giá, công suất, kích thước, bảo hành…</p>
          <Link className="btn" href="/#products">
            Chọn sản phẩm
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="compare-toolbar">
            <label className="checkbox">
              <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Chỉ hiện điểm khác nhau
            </label>
            <span className="muted small">{products.length} sản phẩm · vuốt ngang để xem thêm trên điện thoại</span>
            <button type="button" className="link-btn small" onClick={clearCompare}>
              Xóa tất cả
            </button>
          </div>
          <div className="compare-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Sản phẩm</th>
                  {products.map((p) => (
                    <th key={p.id} scope="col">
                      <div className="compare-head">
                        <button type="button" className="compare-remove" aria-label={`Bỏ ${p.name}`} onClick={() => removeCompare(p.slug)}>
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                        <Link href={`/products/${p.slug}`}>
                          {p.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrl} alt="" width={160} height={120} loading="lazy" />
                          )}
                          <strong>{p.name}</strong>
                        </Link>
                        <PriceTag product={p} />
                        {p.price === cheapest && products.length > 1 && <span className="badge badge-ok">Giá tốt nhất</span>}
                        {p.isBulky && (
                          <span className="badge tag-bulky">
                            <FontAwesomeIcon icon={faTruck} /> Cồng kềnh
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Đánh giá</th>
                  {products.map((p) => (
                    <td key={p.id}>
                      {p.ratingCount > 0 ? (
                        <>
                          <Stars value={p.ratingAvg} /> <span className="muted small">({p.ratingCount})</span>
                        </>
                      ) : (
                        <span className="muted">Chưa có</span>
                      )}
                    </td>
                  ))}
                </tr>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    {r.values.map((v, i) => (
                      <td key={products[i].id}>{v ?? <span className="muted">–</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {products.length < 2 && <p className="muted small">Thêm ít nhất 1 sản phẩm nữa để so sánh.</p>}
        </>
      )}
    </section>
  );
}
