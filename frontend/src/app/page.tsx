import {
  faArrowRight,
  faBolt,
  faBoxOpen,
  faChevronLeft,
  faChevronRight,
  faFire,
  faLayerGroup,
  faMagnifyingGlass,
  faStore,
  faTruckFast,
  faWandMagicSparkles,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { ProductCard } from '@/components/ProductCard';
import { SortSelect } from '@/components/SortSelect';
import { TrustBar } from '@/components/TrustBar';
import { categoryIcon, categoryImage } from '@/lib/icons';
import { getCategories, getHotProducts, getProducts } from '@/lib/server-api';
import { SORT_OPTIONS, type SortValue } from '@/lib/types';

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
  const landing = !filtered && page === 1;

  const [hot, list] = await Promise.all([
    landing ? getHotProducts().catch(() => []) : Promise.resolve([]),
    getProducts({ page, category, q, sort }).catch(() => null),
  ]);

  const href = (params: { page?: number; category?: string | null }) => {
    const qs = new URLSearchParams();
    const c = params.category === null ? undefined : (params.category ?? category);
    if (c) qs.set('category', c);
    if (q) qs.set('q', q);
    if (sort !== 'newest') qs.set('sort', sort);
    if (params.page && params.page > 1) qs.set('page', String(params.page));
    const s = qs.toString();
    return `${s ? `/?${s}` : '/'}#products`;
  };
  const activeCategory = categories.find((c) => c.slug === category);

  return (
    <>
      {landing && (
        <>
          <section className="bento">
            <div className="hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/site/hero.webp" alt="" width={1600} height={1000} fetchPriority="high" />
              <span className="eyebrow">
                <FontAwesomeIcon icon={faWandMagicSparkles} /> Bộ sưu tập 2026
              </span>
              <h1>Không gian sống đẹp bắt đầu từ những món đồ nhỏ</h1>
              <p>Đồ gia dụng, nội thất và thiết bị nhà bếp chính hãng — giao nhanh 2 giờ, đổi trả 30 ngày.</p>
              <Link href="#products" className="btn btn-lg">
                Mua sắm ngay <FontAwesomeIcon icon={faArrowRight} />
              </Link>
            </div>
            <Link href="/?category=dien-gia-dung#products" className="promo promo-a">
              <FontAwesomeIcon icon={faBolt} className="promo-icon" />
              <h2>Điện gia dụng thông minh cho căn bếp hiện đại</h2>
              <span className="go">
                Khám phá <FontAwesomeIcon icon={faArrowRight} />
              </span>
            </Link>
            <Link href="/?category=phong-ngu#products" className="promo promo-b">
              <FontAwesomeIcon icon={faTruckFast} className="promo-icon" />
              <h2>Phòng ngủ êm ái — miễn phí giao lắp đặt</h2>
              <span className="go">
                Xem ngay <FontAwesomeIcon icon={faArrowRight} />
              </span>
            </Link>
          </section>

          <TrustBar />

          {categories.length > 0 && (
            <section className="section">
              <div className="section-head">
                <div>
                  <h2>
                    <FontAwesomeIcon icon={faLayerGroup} /> Mua theo không gian
                  </h2>
                  <p>Chọn nhanh theo từng phòng trong nhà bạn</p>
                </div>
              </div>
              <div className="categories">
                {categories.map((c) => {
                  const img = categoryImage(c.slug);
                  return (
                    <Link key={c.slug} href={href({ category: c.slug })} className="cat-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {img && <img src={img} alt="" width={800} height={800} loading="lazy" />}
                      <span className="cat-ico" aria-hidden>
                        <FontAwesomeIcon icon={categoryIcon(c.slug)} />
                      </span>
                      <strong>{c.name}</strong>
                      <span>{c.productCount} sản phẩm</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {hot.length > 0 && (
            <section className="section">
              <div className="section-head">
                <div>
                  <h2>
                    <FontAwesomeIcon icon={faFire} /> Bán chạy nhất tuần
                  </h2>
                  <p>Được khách hàng lựa chọn nhiều nhất</p>
                </div>
              </div>
              <div className="scroller">
                {hot.map((p, i) => (
                  <ProductCard key={p.id} product={p} eager={i < 4} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="section" id="products" style={{ scrollMarginTop: 'calc(var(--header-h) + 16px)' }}>
        <div className="section-head">
          <div>
            <h2>
              <FontAwesomeIcon icon={activeCategory ? categoryIcon(activeCategory.slug) : faStore} />
              {activeCategory ? activeCategory.name : 'Tất cả sản phẩm'}
            </h2>
            {list && <p>{list.total} sản phẩm</p>}
          </div>
        </div>

        <form className="search-inline" action="/#products" role="search">
          {category && <input type="hidden" name="category" value={category} />}
          {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Tìm trong cửa hàng…" maxLength={100} aria-label="Tìm sản phẩm" />
          <button className="btn" type="submit">
            <FontAwesomeIcon icon={faMagnifyingGlass} /> Tìm
          </button>
        </form>

        <div className="toolbar">
          <div className="chips" role="list" aria-label="Danh mục">
            <Link role="listitem" href={href({ category: null })} className={!category ? 'chip active' : 'chip'}>
              <FontAwesomeIcon icon={faStore} /> Tất cả
            </Link>
            {categories.map((c) => (
              <Link role="listitem" key={c.slug} href={href({ category: c.slug })} className={category === c.slug ? 'chip active' : 'chip'}>
                <FontAwesomeIcon icon={categoryIcon(c.slug)} /> {c.name} <span className="count">{c.productCount}</span>
              </Link>
            ))}
          </div>
          <SortSelect value={sort} />
        </div>

        {q && list && (
          <p className="result-note">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <span>
              {list.total} kết quả cho “<strong>{q}</strong>”
            </span>
            <Link className="link" href={href({})}>
              <FontAwesomeIcon icon={faXmark} /> Xóa tìm kiếm
            </Link>
          </p>
        )}

        {list === null ? (
          <EmptyState icon={faBoxOpen} title="Không tải được sản phẩm">
            <p>Hệ thống đang bận, vui lòng thử lại sau ít phút.</p>
          </EmptyState>
        ) : list.items.length === 0 ? (
          <EmptyState icon={faMagnifyingGlass} title="Không tìm thấy sản phẩm phù hợp">
            <p>Thử từ khóa khác hoặc xem tất cả sản phẩm.</p>
            <Link className="btn btn-ghost" href="/#products">
              Xem tất cả
            </Link>
          </EmptyState>
        ) : (
          <div className="grid">
            {list.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}

        {list && list.totalPages > 1 && (
          <nav className="pagination" aria-label="Phân trang">
            {page > 1 ? (
              <Link className="btn btn-ghost" href={href({ page: page - 1 })}>
                <FontAwesomeIcon icon={faChevronLeft} /> Trước
              </Link>
            ) : (
              <span />
            )}
            <span className="muted">
              Trang {page} / {list.totalPages}
            </span>
            {page < list.totalPages && (
              <Link className="btn btn-ghost" href={href({ page: page + 1 })}>
                Sau <FontAwesomeIcon icon={faChevronRight} />
              </Link>
            )}
          </nav>
        )}
      </section>
    </>
  );
}
