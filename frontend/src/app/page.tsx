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
  faFilter,
  faMoneyBillWave,
  faRotateLeft,
  faTicket,
  faSliders,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { ProductCard } from '@/components/ProductCard';
import { SortSelect } from '@/components/SortSelect';
import { Stars } from '@/components/Stars';
import { TrustBar } from '@/components/TrustBar';
import { categoryIcon, categoryImage } from '@/lib/icons';
import { getBestSellers, getCategories, getDeals, getFacets, getLatestReviews, getProduct, getProducts, getPublicVouchers, getStoreSummary } from '@/lib/server-api';
import { CopyCode } from '@/components/home/CopyCode';
import { FlashCountdown } from '@/components/home/FlashCountdown';
import { CAPACITY_LABEL, POWER_LABEL, PRICE_RANGES, SORT_OPTIONS, formatCompact, formatDay, formatPrice, initials, type SortValue, type Voucher } from '@/lib/types';

/** Giá trị quy đổi để chọn voucher nổi bật (giảm % tính theo mức trần) */
function voucherWorth(v: Voucher): number {
  if (v.type === 'PERCENT') return v.maxDiscount ?? v.value * 10_000;
  return v.value === 0 ? 1_000_000 : v.value;
}

/** 150000 → "150K", 1500000 → "1,5 triệu" */
function shortMoney(v: number): string {
  return v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu` : `${Math.round(v / 1000)}K`;
}

/** 94.356 → "94.000+", 1.104 → "1.100+" (làm tròn XUỐNG, không phóng đại) */
function roundedCount(n: number): string {
  if (n < 100) return String(n);
  const step = n >= 10_000 ? 1000 : 100;
  return `${(Math.floor(n / step) * step).toLocaleString('vi-VN')}+`;
}

function voucherHeadline(v: Voucher): string {
  if (v.type === 'PERCENT') return `Giảm ${v.value}%`;
  if (v.type === 'FREESHIP') return v.value === 0 ? 'Freeship' : `Giảm ${shortMoney(v.value)} ship`;
  return `Giảm ${shortMoney(v.value)}`;
}
import { POLICY, SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    page?: string;
    category?: string;
    q?: string;
    sort?: string;
    sale?: string;
    price?: string;
    material?: string;
    power?: string;
    capacity?: string;
    maxLength?: string;
    bulky?: string;
  }>;
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
    a: `Cùng tỉnh với kho (TP. Hồ Chí Minh) 1–2 ngày, cùng miền 2–3 ngày, khác miền 3–5 ngày. Phí vận chuyển và ngày nhận hàng dự kiến hiển thị ở trang thanh toán; đơn từ ${(SITE.freeShipThreshold).toLocaleString('vi-VN')}₫ được miễn phí vận chuyển (riêng hàng cồng kềnh như sofa, tủ, nệm có phụ phí giao + lắp đặt tận nơi).`,
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
    a: `Bạn gửi yêu cầu Trả hàng/Hoàn tiền trong mục Đơn mua trong ${SITE.returnDays} ngày kể từ khi nhận hàng (kèm lý do và ảnh). Sau khi cửa hàng duyệt, tiền được hoàn về đúng phương thức đã thanh toán; đơn COD được hoàn bằng chuyển khoản.`,
  },
  {
    q: 'Sản phẩm được bảo hành bao lâu? Tra cứu ở đâu?',
    a: `${POLICY.warranty}, tính từ ngày nhận hàng (thời hạn từng sản phẩm ghi trong bảng thông số). Tra cứu hạn bảo hành bất cứ lúc nào tại trang Tra cứu bảo hành bằng mã đơn + số điện thoại, không cần đăng nhập.`,
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
  const facets = await getFacets(category).catch(() => null);
  // Bộ lọc kỹ thuật: chỉ nhận giá trị hợp lệ (có trong facets / khoảng định sẵn) → URL sai không làm hỏng trang
  const tech = {
    material: facets?.materials.some((m) => m.value === searchParams.material) ? searchParams.material : undefined,
    power: searchParams.power && searchParams.power in POWER_LABEL ? searchParams.power : undefined,
    capacity: searchParams.capacity && searchParams.capacity in CAPACITY_LABEL ? searchParams.capacity : undefined,
    maxLength: (() => {
      const n = Number.parseInt(searchParams.maxLength ?? '', 10);
      return n >= 10 && n <= 500 ? n : undefined;
    })(),
    bulky: searchParams.bulky === '1' || undefined,
  };
  const techCount = Object.values(tech).filter(Boolean).length;
  const landing = !q && !category && !onSale && !priceRange && page === 1 && techCount === 0;

  const [deals, best, reviews, list, fresh, topRated, summary, heroProduct, vouchers] = await Promise.all([
    landing ? getDeals().catch(() => []) : Promise.resolve([]),
    landing ? getBestSellers().catch(() => []) : Promise.resolve([]),
    landing ? getLatestReviews().catch(() => []) : Promise.resolve([]),
    getProducts({ page, category, q, sort, onSale, minPrice: priceRange?.min, maxPrice: priceRange?.max, ...tech }).catch(() => null),
    landing ? getProducts({ page: 1, limit: 10, sort: 'newest' }).then((r) => r.items).catch(() => []) : Promise.resolve([]),
    landing ? getProducts({ page: 1, limit: 10, sort: 'top_rated' }).then((r) => r.items).catch(() => []) : Promise.resolve([]),
    landing ? getStoreSummary().catch(() => null) : Promise.resolve(null),
    landing ? getProduct('sofa-nhung-xanh-luc-bao').catch(() => null) : Promise.resolve(null),
    landing ? getPublicVouchers().catch(() => []) : Promise.resolve([]),
  ]);
  // Số THẬT: mức giảm sâu nhất đang có (không làm tròn lên cho đẹp)
  const maxDiscount = Math.max(0, ...deals.map((d) => d.discountPercent));
  // 2 voucher hấp dẫn nhất: 1 giảm tiền (số tiền giảm tối đa lớn nhất) + 1 miễn phí vận chuyển
  const discountVoucher = [...vouchers].filter((v) => v.type !== 'FREESHIP').sort((a, b) => voucherWorth(b) - voucherWorth(a))[0];
  const shipVoucher = vouchers.filter((v) => v.type === 'FREESHIP').sort((a, b) => voucherWorth(b) - voucherWorth(a))[0];
  const heroVouchers = [discountVoucher, shipVoucher].filter((v): v is Voucher => Boolean(v));

  const href = (params: { page?: number; category?: string | null; sale?: boolean; price?: string | null; tech?: Partial<typeof tech> | null }) => {
    const qs = new URLSearchParams();
    const t: Partial<typeof tech> = params.tech === null ? {} : { ...tech, ...(params.tech ?? {}) };
    const c = params.category === null ? undefined : (params.category ?? category);
    const s = params.sale ?? onSale;
    const pr = params.price === null ? undefined : (params.price ?? priceRange?.id);
    if (c) qs.set('category', c);
    if (q) qs.set('q', q);
    if (s) qs.set('sale', '1');
    if (pr) qs.set('price', pr);
    if (sort !== 'newest') qs.set('sort', sort);
    if (t.material) qs.set('material', t.material);
    if (t.power) qs.set('power', t.power);
    if (t.capacity) qs.set('capacity', t.capacity);
    if (t.maxLength) qs.set('maxLength', String(t.maxLength));
    if (t.bulky) qs.set('bulky', '1');
    if (params.page && params.page > 1) qs.set('page', String(params.page));
    const str = qs.toString();
    return `${str ? `/?${str}` : '/'}#products`;
  };
  const activeCategory = categories.find((c) => c.slug === category);

  return (
    <>
      {landing && (
        <>
          <section className="bento hero-v2">
            <div className="hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/site/hero.webp" alt="" width={1600} height={1000} fetchPriority="high" />
              <span className="eyebrow eyebrow-hot">
                <FontAwesomeIcon icon={faFire} /> Siêu sale tháng {new Date().getMonth() + 1}
                {maxDiscount > 0 && ` · Giảm đến ${maxDiscount}%`}
              </span>
              <h1>
                Sắm đồ cho tổ ấm,
                <br />
                <span className="hero-hl">giá hời mỗi ngày</span>
              </h1>
              <ul className="hero-perks">
                <li>
                  <FontAwesomeIcon icon={faTruckFast} /> Freeship đơn từ {SITE.freeShipThreshold / 1000}K
                </li>
                <li>
                  <FontAwesomeIcon icon={faRotateLeft} /> Trả hàng {SITE.returnDays} ngày
                </li>
                <li>
                  <FontAwesomeIcon icon={faMoneyBillWave} /> Kiểm tra hàng rồi trả tiền
                </li>
              </ul>
              <div className="row hero-ctas">
                <Link href="#products" className="btn btn-lg">
                  Mua sắm ngay <FontAwesomeIcon icon={faArrowRight} />
                </Link>
                <Link href="#deals" className="btn btn-lg btn-glass">
                  <FontAwesomeIcon icon={faBolt} /> Săn deal<span className="hide-mobile"> hôm nay</span>
                </Link>
              </div>
              {summary && (
                <p className="hero-proof">
                  <span>
                    <FontAwesomeIcon icon={faStar} /> <strong>{summary.averageRating.toFixed(1)}</strong>/5 từ {roundedCount(summary.reviews)} đánh giá
                  </span>
                  <span>
                    <strong>{roundedCount(summary.sold)}</strong> sản phẩm đã bán
                  </span>
                  <span>
                    <strong>{summary.products}</strong> món chính hãng
                  </span>
                </p>
              )}
              {heroProduct && (
                <Link href={`/products/${heroProduct.slug}`} className="hero-tag">
                  <span className="hero-tag-name">{heroProduct.name}</span>
                  <span className="hero-tag-price">
                    <strong>{formatPrice(heroProduct.price)}</strong>
                    {heroProduct.compareAtPrice && <s>{formatPrice(heroProduct.compareAtPrice)}</s>}
                    {heroProduct.discountPercent > 0 && <em>-{heroProduct.discountPercent}%</em>}
                  </span>
                  <span className="hero-tag-go">
                    Xem ngay <FontAwesomeIcon icon={faArrowRight} />
                  </span>
                </Link>
              )}
            </div>

            <div className="flash-card">
              <div className="flash-head">
                <span className="flash-title">
                  <FontAwesomeIcon icon={faBolt} /> FLASH SALE
                </span>
                <span className="flash-ends">
                  Kết thúc sau <FlashCountdown />
                </span>
              </div>
              <ul className="flash-items">
                {deals.slice(0, 3).map((p) => {
                  const soldPct = Math.min(95, Math.round((p.soldCount / Math.max(1, p.soldCount + p.stock)) * 100));
                  return (
                    <li key={p.id}>
                      <Link href={`/products/${p.slug}`}>
                        <span className="flash-thumb">
                          {p.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrl} alt="" width={96} height={96} loading="eager" />
                          )}
                          {p.discountPercent > 0 && <em>-{p.discountPercent}%</em>}
                        </span>
                        <span className="flash-info">
                          <span className="flash-name">{p.name}</span>
                          <span className="flash-price">
                            <strong>{formatPrice(p.price)}</strong>
                            {p.compareAtPrice && <s>{formatPrice(p.compareAtPrice)}</s>}
                          </span>
                          <span className="flash-bar" aria-label={`Đã bán ${soldPct}%`}>
                            <span style={{ width: `${soldPct}%` }} />
                            <small>
                              <FontAwesomeIcon icon={faFire} /> Đã bán {formatCompact(p.soldCount)}
                            </small>
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link href={href({ category: null, sale: true })} className="flash-more">
                Xem tất cả {summary ? `${summary.onSale} deal` : 'deal'} <FontAwesomeIcon icon={faArrowRight} />
              </Link>
            </div>

            {heroVouchers.length > 0 && (
              <div className="hero-vouchers">
                <span className="hero-vouchers-title">
                  <FontAwesomeIcon icon={faTicket} /> Voucher hôm nay · bấm để sao chép
                </span>
                {heroVouchers.map((v) => (
                  <div key={v.code} className={`hero-voucher hero-voucher-${v.type.toLowerCase()}`}>
                    <span className="hero-voucher-value">{voucherHeadline(v)}</span>
                    <span className="hero-voucher-cond">{v.minOrderValue > 0 ? `Đơn từ ${shortMoney(v.minOrderValue)}` : 'Mọi đơn hàng'}</span>
                    <CopyCode code={v.code} />
                  </div>
                ))}
              </div>
            )}
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

        {facets && (facets.materials.length > 0 || facets.power.length > 0 || facets.capacity.length > 0 || facets.withDimensions > 0) && (
          <details className="tech-filters" open={techCount > 0}>
            <summary>
              <FontAwesomeIcon icon={faSliders} /> Bộ lọc nâng cao
              {techCount > 0 && <span className="badge-count inline">{techCount}</span>}
              <span className="muted small tech-filters-hint">Chất liệu · Công suất · Dung tích · Kích thước</span>
            </summary>
            <form action="/#products" className="tech-filters-form">
              {category && <input type="hidden" name="category" value={category} />}
              {q && <input type="hidden" name="q" value={q} />}
              {onSale && <input type="hidden" name="sale" value="1" />}
              {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
              {priceRange && <input type="hidden" name="price" value={priceRange.id} />}
              {facets.materials.length > 0 && (
                <label className="field">
                  Chất liệu
                  <select className="input" name="material" defaultValue={tech.material ?? ''}>
                    <option value="">Tất cả</option>
                    {facets.materials.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.value} ({m.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {facets.power.length > 0 && (
                <label className="field">
                  Công suất
                  <select className="input" name="power" defaultValue={tech.power ?? ''}>
                    <option value="">Tất cả</option>
                    {facets.power.map((b) => (
                      <option key={b.value} value={b.value}>
                        {POWER_LABEL[b.value]} ({b.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {facets.capacity.length > 0 && (
                <label className="field">
                  Dung tích
                  <select className="input" name="capacity" defaultValue={tech.capacity ?? ''}>
                    <option value="">Tất cả</option>
                    {facets.capacity.map((b) => (
                      <option key={b.value} value={b.value}>
                        {CAPACITY_LABEL[b.value]} ({b.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {facets.withDimensions > 0 && (
                <label className="field">
                  Chiều dài tối đa (cm)
                  <input
                    className="input"
                    type="number"
                    name="maxLength"
                    min={10}
                    max={500}
                    inputMode="numeric"
                    placeholder="VD: 180"
                    defaultValue={tech.maxLength ?? ''}
                  />
                </label>
              )}
              {facets.bulky > 0 && (
                <label className="checkbox tech-filters-bulky">
                  <input type="checkbox" name="bulky" value="1" defaultChecked={Boolean(tech.bulky)} /> Chỉ hàng cồng kềnh (giao + lắp đặt)
                </label>
              )}
              <div className="tech-filters-actions">
                <button className="btn" type="submit">
                  <FontAwesomeIcon icon={faFilter} /> Áp dụng
                </button>
                {techCount > 0 && (
                  <Link className="btn btn-ghost" href={href({ tech: null })}>
                    <FontAwesomeIcon icon={faXmark} /> Xóa bộ lọc
                  </Link>
                )}
              </div>
            </form>
          </details>
        )}

        {techCount > 0 && (
          <div className="active-filters" aria-label="Bộ lọc đang áp dụng">
            {tech.material && (
              <Link className="chip active" href={href({ tech: { material: undefined } })}>
                {tech.material} <FontAwesomeIcon icon={faXmark} />
              </Link>
            )}
            {tech.power && (
              <Link className="chip active" href={href({ tech: { power: undefined } })}>
                {POWER_LABEL[tech.power]} <FontAwesomeIcon icon={faXmark} />
              </Link>
            )}
            {tech.capacity && (
              <Link className="chip active" href={href({ tech: { capacity: undefined } })}>
                {CAPACITY_LABEL[tech.capacity]} <FontAwesomeIcon icon={faXmark} />
              </Link>
            )}
            {tech.maxLength && (
              <Link className="chip active" href={href({ tech: { maxLength: undefined } })}>
                Dài tối đa {tech.maxLength} cm <FontAwesomeIcon icon={faXmark} />
              </Link>
            )}
            {tech.bulky && (
              <Link className="chip active" href={href({ tech: { bulky: undefined } })}>
                Hàng cồng kềnh <FontAwesomeIcon icon={faXmark} />
              </Link>
            )}
          </div>
        )}

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
              <p>Chưa thấy câu trả lời? Gọi hotline {SITE.hotline} ({SITE.supportHours})</p>
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
            <h2>{POLICY.freeShip}</h2>
            <p>Kết hợp thêm voucher vận chuyển cho đơn nhỏ hơn – áp dụng ngay ở trang thanh toán.</p>
          </div>
          <Link href="/register" className="btn btn-dark">
            Tạo tài khoản miễn phí
          </Link>
        </section>
      )}
    </>
  );
}
