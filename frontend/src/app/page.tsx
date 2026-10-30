import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { SortSelect } from '@/components/SortSelect';
import { getCategories, getHotProducts, getProducts } from '@/lib/server-api';
import { SORT_OPTIONS, categoryIcon, type SortValue } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ page?: string; category?: string; q?: string; sort?: string }>;
}

export default async function HomePage(props: Props) {
  const searchParams = await props.searchParams;
  const page = Math.min(1000, Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1));
  const q = (searchParams.q ?? '').trim().slice(0, 100) || undefined;
  const sort: SortValue = SORT_OPTIONS.some((o) => o.value === searchParams.sort) ? (searchParams.sort as SortValue) : 'newest';

  const categories = await getCategories().catch(() => []);
  const category = categories.some((c) => c.slug === searchParams.category) ? searchParams.category : undefined;
  const filtered = Boolean(q || category);

  const [hot, list] = await Promise.all([
    filtered || page > 1 ? Promise.resolve([]) : getHotProducts().catch(() => []),
    getProducts({ page, category, q, sort }).catch(() => null),
  ]);

  const href = (params: { page?: number; category?: string | null }) => {
    const qs = new URLSearchParams();
    const c = params.category === null ? undefined : params.category ?? category;
    if (c) qs.set('category', c);
    if (q) qs.set('q', q);
    if (sort !== 'newest') qs.set('sort', sort);
    if (params.page && params.page > 1) qs.set('page', String(params.page));
    const s = qs.toString();
    return s ? `/?${s}` : '/';
  };

  return (
    <>
      {!filtered && page === 1 && (
        <section className="hero">
          <div>
            <h1>Đồ gia dụng cho mọi ngôi nhà</h1>
            <p>Giao nhanh 2h nội thành · Đổi trả 30 ngày · Bảo hành chính hãng</p>
          </div>
          <span className="hero-art" aria-hidden>
            🛋️🍳🛏️
          </span>
        </section>
      )}

      <form className="search" action="/" role="search">
        {category && <input type="hidden" name="category" value={category} />}
        {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
        <input className="input" type="search" name="q" defaultValue={q} placeholder="Tìm nồi chiên, sofa, chăn ga…" maxLength={100} aria-label="Tìm sản phẩm" />
        <button className="btn" type="submit">
          Tìm kiếm
        </button>
      </form>

      {hot.length > 0 && (
        <>
          <h2 className="section-title">🔥 Sản phẩm bán chạy</h2>
          <div className="grid">
            {hot.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}

      <div className="toolbar">
        <div className="chips" role="list" aria-label="Danh mục">
          <Link role="listitem" href={href({ category: null })} className={!category ? 'chip active' : 'chip'}>
            Tất cả
          </Link>
          {categories.map((c) => (
            <Link role="listitem" key={c.slug} href={href({ category: c.slug })} className={category === c.slug ? 'chip active' : 'chip'}>
              {categoryIcon(c.slug)} {c.name} <span className="muted small">({c.productCount})</span>
            </Link>
          ))}
        </div>
        <SortSelect value={sort} />
      </div>

      {q && list && (
        <p className="muted">
          {list.total} kết quả cho “<strong>{q}</strong>” · <Link href={href({ category })}>Xóa tìm kiếm</Link>
        </p>
      )}

      {list === null ? (
        <p className="alert">Không tải được danh sách sản phẩm. Vui lòng thử lại sau.</p>
      ) : list.items.length === 0 ? (
        <div className="empty">
          <span aria-hidden>🔍</span>
          <p>Không tìm thấy sản phẩm phù hợp.</p>
          <Link className="btn btn-ghost" href="/">
            Xem tất cả sản phẩm
          </Link>
        </div>
      ) : (
        <div className="grid">
          {list.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {list && list.totalPages > 1 && (
        <nav className="pagination" aria-label="Phân trang">
          {page > 1 && (
            <Link className="btn btn-ghost" href={href({ page: page - 1 })}>
              ← Trước
            </Link>
          )}
          <span className="muted">
            Trang {page}/{list.totalPages}
          </span>
          {page < list.totalPages && (
            <Link className="btn btn-ghost" href={href({ page: page + 1 })}>
              Sau →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
