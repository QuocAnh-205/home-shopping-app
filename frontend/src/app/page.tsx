import {
  faArrowRight,
  faBolt,
  faBoxOpen,
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faFire,
  faLayerGroup,
  faMagnifyingGlass,
  faPercent,
  faQuoteLeft,
  faStore,
  faTag,
  faTruckFast,
  faWandMagicSparkles,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { ProductCard } from '@/components/ProductCard';
import { SortSelect } from '@/components/SortSelect';
import { Stars } from '@/components/Stars';
import { TrustBar } from '@/components/TrustBar';
import { categoryIcon, categoryImage } from '@/lib/icons';
import { getBestSellers, getCategories, getDeals, getLatestReviews, getProducts } from '@/lib/server-api';
import { SORT_OPTIONS, formatDay, initials, type SortValue } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ page?: string; category?: string; q?: string; sort?: string; sale?: string }>;
}

export default async function HomePage(props: Props) {
  const searchParams = await props.searchParams;
  const page = Math.min(1000, Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1));
  const q = (searchParams.q ?? '').trim().slice(0, 100) || undefined;
  const sort: SortValue = SORT_OPTIONS.some((o) => o.value === searchParams.sort) ? (searchParams.sort as SortValue) : 'newest';
  const onSale = searchParams.sale === '1';

  const categories = await getCategories().catch(() => []);
  const category = categories.some((c) => c.slug === searchParams.category) ? searchParams.category : undefined;
  const landing = !q && !category && !onSale && page === 1;

  const [deals, best, reviews, list] = await Promise.all([
    landing ? getDeals().catch(() => []) : Promise.resolve([]),
    landing ? getBestSellers().catch(() => []) : Promise.resolve([]),
    landing ? getLatestReviews().catch(() => []) : Promise.resolve([]),
    getProducts({ page, category, q, sort, onSale }).catch(() => null),
  ]);

  const href = (params: { page?: number; category?: string | null; sale?: boolean }) => {
    const qs = new URLSearchParams();
    const c = params.category === null ? undefined : (params.category ?? category);
    const s = params.sale ?? onSale;
    if (c) qs.set('category', c);
    if (q) qs.set('q', q);
    if (s) qs.set('sale', '1');
    if (sort !== 'newest') qs.set('sort', sort);
    if (params.page && params.page > 1) qs.set('page', String(params.page));
    const str = qs.toString();
    return `${str ? `/?${str}` : '/'}#products`;
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
              <p>Hơn 130 món đồ gia dụng, nội thất và thiết bị nhà bếp chính hãng — giao nhanh 2 giờ, đổi trả 30 ngày.</p>
              <div className="row">
                <Link href="#products" className="btn btn-lg">
                  Mua sắm ngay <FontAwesomeIcon icon={faArrowRight} />
                </Link>
                <Link href="#deals" className="btn btn-lg btn-glass">
                  <FontAwesomeIcon icon={faTag} /> Xem ưu đãi
                </Link>
              </div>
            </div>
            <Link href={href({ category: 'dien-gia-dung', sale: false })} className="promo promo-a">
              <FontAwesomeIcon icon={faBolt} className="promo-icon" />
              <h2>Điện gia dụng thông minh cho căn bếp hiện đại</h2>
              <span className="go">
                Khám phá <FontAwesomeIcon icon={faArrowRight} />
              </span>
            </Link>
            <Link href={href({ category: null, sale: true })} className="promo promo-b">
              <FontAwesomeIcon icon={faPercent} className="promo-icon" />
              <h2>Hơn 60 sản phẩm đang giảm giá</h2>
              <span className="go">
                Săn deal ngay <FontAwesomeIcon icon={faArrowRight} />
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
                  <p>Chọn nhanh theo từng phòng trong ngôi nhà của bạn</p>
                </div>
              </div>
              <div className="categories">
                {categories.map((c) => {
                  const img = categoryImage(c.slug);
                  return (
                    <Link key={c.slug} href={href({ category: c.slug, sale: false })} className="cat-card">
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

          {deals.length > 0 && (
            <section className="section deals" id="deals">
              <div className="section-head">
                <div>
                  <h2>
                    <FontAwesomeIcon icon={faTag} /> Ưu đãi hấp dẫn
                  </h2>
                  <p>Giảm giá sâu nhất hôm nay – số lượng có hạn</p>
                </div>
                <Link className="link" href={href({ category: null, sale: true })}>
                  Tất cả ưu đãi <FontAwesomeIcon icon={faChevronRight} />
                </Link>
              </div>
              <div className="scroller">
                {deals.map((p, i) => (
                  <ProductCard key={p.id} product={p} eager={i < 4} />
                ))}
              </div>
            </section>
          )}

          {best.length > 0 && (
            <section className="section">
              <div className="section-head">
                <div>
                  <h2>
                    <FontAwesomeIcon icon={faFire} /> Bán chạy nhất
                  </h2>
                  <p>Xếp hạng theo số lượng đã bán thực tế</p>
                </div>
                <Link className="link" href="/?sort=best_selling#products">
                  Xem bảng xếp hạng <FontAwesomeIcon icon={faChevronRight} />
                </Link>
              </div>
              <div className="scroller">
                {best.map((p, i) => (
                  <ProductCard key={p.id} product={p} rank={i + 1} />
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
              <FontAwesomeIcon icon={onSale ? faTag : activeCategory ? categoryIcon(activeCategory.slug) : faStore} />
              {onSale ? 'Sản phẩm đang giảm giá' : activeCategory ? activeCategory.name : 'Tất cả sản phẩm'}
            </h2>
            {list && <p>{list.total} sản phẩm</p>}
          </div>
        </div>

        <form className="search-inline" action="/#products" role="search">
          {category && <input type="hidden" name="category" value={category} />}
          {onSale && <input type="hidden" name="sale" value="1" />}
          {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Tìm kiếm sản phẩm gia dụng…" maxLength={100} aria-label="Tìm sản phẩm" />
          <button className="btn" type="submit">
            <FontAwesomeIcon icon={faMagnifyingGlass} /> Tìm
          </button>
        </form>

        <div className="toolbar">
          <div className="chips" role="list" aria-label="Danh mục">
            <Link role="listitem" href={href({ category: null, sale: false })} className={!category && !onSale ? 'chip active' : 'chip'}>
              <FontAwesomeIcon icon={faStore} /> Tất cả
            </Link>
            <Link role="listitem" href={href({ sale: !onSale })} className={onSale ? 'chip chip-sale active' : 'chip chip-sale'}>
              <FontAwesomeIcon icon={faTag} /> Đang giảm giá
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

      {landing && reviews.length > 0 && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>
                <FontAwesomeIcon icon={faQuoteLeft} /> Khách hàng nói gì
              </h2>
              <p>Đánh giá mới nhất từ người mua</p>
            </div>
          </div>
          <div className="testimonials">
            {reviews.map((r) => (
              <Link key={r.id} href={`/products/${r.product.slug}#reviews`} className="testimonial">
                <div className="testimonial-author">
                  <span className="avatar" aria-hidden>
                    {initials(r.user.fullName)}
                  </span>
                  <span>
                    <strong>{r.user.fullName}</strong>
                    <small className="muted">{formatDay(r.createdAt)}</small>
                    {r.verifiedPurchase && (
                      <small className="ok">
                        <FontAwesomeIcon icon={faCircleCheck} /> Đã mua hàng
                      </small>
                    )}
                  </span>
                </div>
                <div className="testimonial-body">
                  <Stars value={r.rating} />
                  <p>{r.comment}</p>
                  <span className="testimonial-product muted small">Về sản phẩm: {r.product.name}</span>
                </div>
                {r.product.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="testimonial-thumb" src={r.product.imageUrl} alt={r.product.name} width={96} height={72} loading="lazy" />
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {landing && (
        <section className="section cta-band">
          <FontAwesomeIcon icon={faTruckFast} />
          <div>
            <h2>Miễn phí giao hàng & lắp đặt</h2>
            <p>Áp dụng cho mọi đơn nội thành – đặt trước 16h, nhận ngay trong ngày.</p>
          </div>
          <Link href="/register" className="btn btn-dark">
            Tạo tài khoản miễn phí
          </Link>
        </section>
      )}
    </>
  );
}
