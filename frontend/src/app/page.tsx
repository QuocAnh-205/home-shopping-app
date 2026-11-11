import {
  faArrowRight,
  faBolt,
  faBoxOpen,
  faCartPlus,
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faCircleQuestion,
  faFire,
  faHandHoldingDollar,
  faLayerGroup,
  faMagnifyingGlass,
  faMedal,
  faPercent,
  faQuoteLeft,
  faSeedling,
  faStar,
  faStore,
  faTag,
  faTruckFast,
  faWallet,
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
import { getBestSellers, getCategories, getDeals, getLatestReviews, getProducts, getStoreSummary } from '@/lib/server-api';
import { PRICE_RANGES, SORT_OPTIONS, formatCompact, formatDay, initials, type SortValue } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ page?: string; category?: string; q?: string; sort?: string; sale?: string; price?: string }>;
}

/** Bộ sưu tập theo không gian: ảnh thật của sản phẩm tiêu biểu trong danh mục */
const COLLECTIONS = [
  {
    category: 'nha-bep',
    image: '/images/products/noi-gang-trang-men-do-24cm.webp',
    eyebrow: 'Bộ sưu tập bếp',
    title: 'Góc bếp ấm áp cho bữa cơm nhà',
    text: 'Nồi gang, dao thớt, hũ gia vị – đủ đồ để nấu ngon mỗi ngày.',
  },
  {
    category: 'phong-khach',
    image: '/images/products/den-tha-chao-non-long-dong.webp',
    eyebrow: 'Phòng khách',
    title: 'Ánh sáng & nội thất tối giản',
    text: 'Đèn thả, đôn, kệ treo tường giúp phòng khách có điểm nhấn.',
  },
  {
    category: 'phong-ngu',
    image: '/images/products/den-ban-gom-dua-chup-lanh.webp',
    eyebrow: 'Phòng ngủ',
    title: 'Giấc ngủ sâu, không gian dịu nhẹ',
    text: 'Đèn ngủ, chăn len, tủ đầu giường cho buổi tối thư thái.',
  },
] as const;

const STEPS = [
  { icon: faMagnifyingGlass, title: 'Chọn sản phẩm', text: 'Tìm theo không gian, mức giá hoặc gõ tên món đồ bạn cần.' },
  { icon: faCartPlus, title: 'Thêm vào giỏ', text: 'Giỏ hàng lưu theo tài khoản, mở trên máy nào cũng còn.' },
  { icon: faWallet, title: 'Đặt hàng & thanh toán', text: 'Chọn địa chỉ, voucher và trả tiền khi nhận hàng (COD) hoặc thanh toán online.' },
  { icon: faStar, title: 'Nhận hàng & đánh giá', text: 'Theo dõi đơn trong "Đơn mua" và chia sẻ cảm nhận của bạn.' },
] as const;

const FAQ = [
  {
    q: 'Bao lâu thì tôi nhận được hàng?',
    a: 'Đơn nội thành đặt trước 16h được giao trong ngày; các tỉnh thành khác từ 2–4 ngày làm việc. Bạn theo dõi trạng thái đơn trong mục Đơn mua.',
  },
  {
    q: 'Có những hình thức thanh toán nào?',
    a: 'Thanh toán khi nhận hàng (COD) – được mở hộp kiểm tra trước khi trả tiền; hoặc thanh toán online qua VNPay (thẻ ATM, Visa/Master, QR ngân hàng), ví MoMo, chuyển khoản bằng mã VietQR. Trang thanh toán chỉ hiện những phương thức cửa hàng đang hỗ trợ.',
  },
  {
    q: 'Thanh toán online xong nhưng đơn vẫn "Chờ thanh toán"?',
    a: 'Đơn được giữ hàng 15 phút. Hệ thống chỉ xác nhận khi nhận được thông báo có chữ ký từ cổng thanh toán, thường trong vài giây. Nếu quá 15 phút chưa thanh toán, đơn tự hủy và hàng được trả về kho; tiền đã trừ (nếu có) được hoàn tự động về tài khoản của bạn.',
  },
  {
    q: 'Voucher dùng thế nào?',
    a: 'Ở trang thanh toán, mỗi đơn dùng được 1 voucher giảm giá và 1 voucher vận chuyển. Voucher chưa đủ điều kiện sẽ ghi rõ lý do (ví dụ "Mua thêm 50.000₫"). Hủy đơn thì voucher được trả lại lượt dùng.',
  },
  {
    q: 'Chính sách trả hàng / hoàn tiền như thế nào?',
    a: 'Bạn gửi yêu cầu Trả hàng/Hoàn tiền trong mục Đơn mua trong 15 ngày kể từ khi nhận hàng (kèm lý do và ảnh). Sau khi cửa hàng duyệt, tiền được hoàn về đúng phương thức đã thanh toán; đơn COD được hoàn bằng chuyển khoản. Đồ điện gia dụng được bảo hành chính hãng 12–24 tháng.',
  },
  {
    q: 'Làm sao để hủy đơn đã đặt?',
    a: 'Vào Đơn mua, chọn đơn rồi bấm Hủy đơn và chọn lý do. Bạn tự hủy được khi đơn còn ở trạng thái Chờ thanh toán hoặc Chờ xác nhận; khi cửa hàng đã chuẩn bị hàng, vui lòng liên hệ cửa hàng. Đơn đã thanh toán online khi bị hủy sẽ được hoàn tiền tự động.',
  },
  {
    q: 'Tôi quên mật khẩu thì phải làm sao?',
    a: 'Bấm "Quên mật khẩu" ở trang đăng nhập và nhập email để nhận liên kết đặt lại (hiệu lực 30 phút). Bạn cũng có thể đăng nhập nhanh bằng Google hoặc Facebook.',
  },
] as const;

export default async function HomePage(props: Props) {
  const searchParams = await props.searchParams;
  const page = Math.min(1000, Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1));
  const q = (searchParams.q ?? '').trim().slice(0, 100) || undefined;
  const sort: SortValue = SORT_OPTIONS.some((o) => o.value === searchParams.sort) ? (searchParams.sort as SortValue) : 'newest';
  const onSale = searchParams.sale === '1';
  const priceRange = PRICE_RANGES.find((r) => r.id === searchParams.price);

  const categories = await getCategories().catch(() => []);
  const category = categories.some((c) => c.slug === searchParams.category) ? searchParams.category : undefined;
  const landing = !q && !category && !onSale && !priceRange && page === 1;

  const [deals, best, reviews, list, fresh, topRated, summary] = await Promise.all([
    landing ? getDeals().catch(() => []) : Promise.resolve([]),
    landing ? getBestSellers().catch(() => []) : Promise.resolve([]),
    landing ? getLatestReviews().catch(() => []) : Promise.resolve([]),
    getProducts({ page, category, q, sort, onSale, minPrice: priceRange?.min, maxPrice: priceRange?.max }).catch(() => null),
    landing ? getProducts({ page: 1, limit: 10, sort: 'newest' }).then((r) => r.items).catch(() => []) : Promise.resolve([]),
    landing ? getProducts({ page: 1, limit: 10, sort: 'top_rated' }).then((r) => r.items).catch(() => []) : Promise.resolve([]),
    landing ? getStoreSummary().catch(() => null) : Promise.resolve(null),
  ]);

  const href = (params: { page?: number; category?: string | null; sale?: boolean; price?: string | null }) => {
    const qs = new URLSearchParams();
    const c = params.category === null ? undefined : (params.category ?? category);
    const s = params.sale ?? onSale;
    const pr = params.price === null ? undefined : (params.price ?? priceRange?.id);
    if (c) qs.set('category', c);
    if (q) qs.set('q', q);
    if (s) qs.set('sale', '1');
    if (pr) qs.set('price', pr);
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
              <p>
                {summary ? `${summary.products} món` : 'Hàng trăm món'} đồ gia dụng, nội thất và thiết bị nhà bếp chính hãng — giao nhanh 2 giờ,
                trả hàng 15 ngày.
              </p>
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
              <h2>{summary ? `${summary.onSale} sản phẩm đang giảm giá` : 'Hàng loạt sản phẩm đang giảm giá'}</h2>
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

          <section className="section">
            <div className="section-head">
              <div>
                <h2>
                  <FontAwesomeIcon icon={faHandHoldingDollar} /> Mua theo mức giá
                </h2>
                <p>Chọn nhanh trong ngân sách của bạn</p>
              </div>
            </div>
            <div className="price-tiles">
              {PRICE_RANGES.map((r, i) => (
                <Link key={r.id} href={href({ price: r.id, category: null, sale: false })} className={`price-tile price-tile-${i + 1}`}>
                  <small>{r.hint}</small>
                  <strong>{r.label}</strong>
                  <span className="go">
                    Xem ngay <FontAwesomeIcon icon={faArrowRight} />
                  </span>
                </Link>
              ))}
            </div>
          </section>

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

          <section className="section collections" aria-label="Bộ sưu tập">
            {COLLECTIONS.map((c, i) => (
              <Link
                key={c.category}
                href={href({ category: c.category, sale: false, price: null })}
                className={i === 0 ? 'collection collection-lg' : 'collection'}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image} alt="" width={1200} height={900} loading="lazy" />
                <span className="eyebrow">{c.eyebrow}</span>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
                <span className="go">
                  Khám phá bộ sưu tập <FontAwesomeIcon icon={faArrowRight} />
                </span>
              </Link>
            ))}
          </section>

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

          {summary && (
            <section className="section stats-band" aria-label="Home Shopping qua những con số">
              <div>
                <strong>{summary.products}</strong>
                <span>sản phẩm đang bán</span>
              </div>
              <div>
                <strong>{formatCompact(summary.sold)}</strong>
                <span>sản phẩm đã giao tới khách</span>
              </div>
              <div>
                <strong>{formatCompact(summary.reviews)}</strong>
                <span>đánh giá từ {summary.reviewers} khách hàng</span>
              </div>
              <div>
                <strong>
                  {summary.averageRating.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
                  <small>/5</small>
                </strong>
                <span>điểm hài lòng trung bình</span>
              </div>
            </section>
          )}

          {fresh.length > 0 && (
            <section className="section">
              <div className="section-head">
                <div>
                  <h2>
                    <FontAwesomeIcon icon={faSeedling} /> Hàng mới về
                  </h2>
                  <p>Những món vừa lên kệ tuần này</p>
                </div>
                <Link className="link" href="/?sort=newest#products">
                  Xem tất cả <FontAwesomeIcon icon={faChevronRight} />
                </Link>
              </div>
              <div className="scroller">
                {fresh.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          )}

          {topRated.length > 0 && (
            <section className="section">
              <div className="section-head">
                <div>
                  <h2>
                    <FontAwesomeIcon icon={faMedal} /> Được đánh giá cao nhất
                  </h2>
                  <p>Khách hàng chấm điểm cao và mua lại nhiều lần</p>
                </div>
                <Link className="link" href="/?sort=top_rated#products">
                  Xem tất cả <FontAwesomeIcon icon={faChevronRight} />
                </Link>
              </div>
              <div className="scroller">
                {topRated.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <div>
                <h2>
                  <FontAwesomeIcon icon={faCircleCheck} /> Mua sắm dễ dàng trong 4 bước
                </h2>
                <p>Từ lúc chọn món đến khi nhận hàng tận tay</p>
              </div>
            </div>
            <ol className="steps">
              {STEPS.map((st, i) => (
                <li key={st.title}>
                  <span className="step-no">{String(i + 1).padStart(2, '0')}</span>
                  <FontAwesomeIcon icon={st.icon} className="step-ico" />
                  <strong>{st.title}</strong>
                  <p>{st.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      <section className="section" id="products" style={{ scrollMarginTop: 'calc(var(--header-h) + 16px)' }}>
        <div className="section-head">
          <div>
            <h2>
              <FontAwesomeIcon icon={onSale ? faTag : activeCategory ? categoryIcon(activeCategory.slug) : faStore} />
              {onSale ? 'Sản phẩm đang giảm giá' : activeCategory ? activeCategory.name : 'Tất cả sản phẩm'}
              {priceRange && <span className="muted"> · {priceRange.label}</span>}
            </h2>
            {list && <p>{list.total} sản phẩm</p>}
          </div>
        </div>

        <form className="search-inline" action="/#products" role="search">
          {category && <input type="hidden" name="category" value={category} />}
          {onSale && <input type="hidden" name="sale" value="1" />}
          {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
          {priceRange && <input type="hidden" name="price" value={priceRange.id} />}
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Tìm kiếm sản phẩm gia dụng…" maxLength={100} aria-label="Tìm sản phẩm" />
          <button className="btn" type="submit">
            <FontAwesomeIcon icon={faMagnifyingGlass} /> Tìm
          </button>
        </form>

        <div className="toolbar">
          <div className="chips" role="list" aria-label="Danh mục">
            <Link
              role="listitem"
              href={href({ category: null, sale: false, price: null })}
              className={!category && !onSale && !priceRange ? 'chip active' : 'chip'}
            >
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

        {priceRange && (
          <p className="result-note">
            <FontAwesomeIcon icon={faHandHoldingDollar} />
            <span>
              Đang lọc theo giá: <strong>{priceRange.label}</strong>
            </span>
            <Link className="link" href={href({ price: null })}>
              <FontAwesomeIcon icon={faXmark} /> Bỏ lọc giá
            </Link>
          </p>
        )}

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
        <section className="section">
          <div className="section-head">
            <div>
              <h2>
                <FontAwesomeIcon icon={faCircleQuestion} /> Câu hỏi thường gặp
              </h2>
              <p>Chưa thấy câu trả lời? Gọi hotline 1900 6868 (8h–22h mỗi ngày)</p>
            </div>
          </div>
          <div className="faq">
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
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
