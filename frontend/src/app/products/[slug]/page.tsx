import {
  faBoxOpen,
  faChevronRight,
  faCircleCheck,
  faClipboardList,
  faCubes,
  faHouse,
  faListCheck,
  faMoneyBillWave,
  faRotateLeft,
  faShieldHalved,
  faScrewdriverWrench,
  faTruck,
  faTruckFast,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AddToCartButton } from '@/components/AddToCartButton';
import { CompareButton } from '@/components/CompareButton';
import { PriceTag } from '@/components/PriceTag';
import { ProductCard } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { ReviewSection } from '@/components/ReviewSection';
import { Stars } from '@/components/Stars';
import { StockBadge } from '@/components/StockBadge';
import { CARE_GUIDE, categoryIcon } from '@/lib/icons';
import { ApiError, getProduct, getProducts } from '@/lib/server-api';
import { formatCompact, formatPrice, formatWarranty, type ProductDetail } from '@/lib/types';
import { POLICY, SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

// cache(): generateMetadata và page dùng chung 1 lần gọi API trong cùng request
const load = cache(async (slug: string): Promise<ProductDetail> => {
  try {
    return await getProduct(slug);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await load((await params).slug);
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    openGraph: { title: product.name, images: product.imageUrl ? [product.imageUrl] : [] },
  };
}

const PERKS = [
  { icon: faTruckFast, title: 'Giao nhanh toàn quốc', text: POLICY.freeShipShort },
  { icon: faRotateLeft, title: POLICY.returns, text: 'Yêu cầu ngay trong Đơn mua, hoàn tiền nhanh' },
  { icon: faShieldHalved, title: 'Chính hãng 100%', text: 'Bảo hành theo nhà sản xuất' },
  { icon: faMoneyBillWave, title: 'COD hoặc online', text: 'Kiểm tra hàng rồi trả tiền, hoặc VNPay / MoMo' },
];

export default async function ProductPage({ params }: Props) {
  const product = await load((await params).slug);
  const related = await getProducts({ page: 1, limit: 9, category: product.category.slug, sort: 'best_selling' })
    .then((r) => r.items.filter((p) => p.id !== product.id).slice(0, 8))
    .catch(() => []);
  const specs = Object.entries(product.specs ?? {});
  const care = CARE_GUIDE[product.category.slug] ?? [];
  const saving = product.compareAtPrice ? Number(product.compareAtPrice) - Number(product.price) : 0;

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">
          <FontAwesomeIcon icon={faHouse} /> Trang chủ
        </Link>
        <FontAwesomeIcon icon={faChevronRight} />
        <Link href={`/?category=${product.category.slug}#products`}>{product.category.name}</Link>
        <FontAwesomeIcon icon={faChevronRight} />
        <span aria-current="page">{product.name}</span>
      </nav>

      <article className="product-detail">
        <div className="gallery">
          <ProductImage product={product} eager />
          {product.discountPercent > 0 && <span className="gallery-badge">-{product.discountPercent}%</span>}
        </div>

        <div className="detail-info">
          <span className="card-cat">
            <FontAwesomeIcon icon={categoryIcon(product.category.slug)} /> {product.category.name}
            {product.isHot && <span className="badge tag-hot">Bán chạy</span>}
          </span>
          <h1>{product.name}</h1>
          <div className="detail-stats">
            {product.ratingCount > 0 ? (
              <a href="#reviews" className="detail-rating">
                <strong>{product.ratingAvg.toFixed(1)}</strong>
                <Stars value={product.ratingAvg} />
                <span className="muted">{product.ratingCount} đánh giá</span>
              </a>
            ) : (
              <a href="#reviews" className="muted">
                Chưa có đánh giá – hãy là người đầu tiên
              </a>
            )}
            <span className="divider" aria-hidden />
            <span className="muted">Đã bán {formatCompact(product.soldCount)}</span>
          </div>

          <div className="price-box">
            <PriceTag product={product} large />
            {saving > 0 && <span className="small ok">Tiết kiệm {formatPrice(saving)}</span>}
          </div>

          {product.variants.length > 1 && (
            <div className="variant-picker" role="group" aria-label={product.variantName ?? 'Phân loại'}>
              <span className="variant-picker-label">
                {product.variantName ?? 'Phân loại'}: <strong>{product.variantLabel}</strong>
              </span>
              <div className="variant-options">
                {product.variants.map((v) => {
                  const current = v.slug === product.slug;
                  return (
                    <Link
                      key={v.slug}
                      href={`/products/${v.slug}`}
                      replace
                      scroll={false}
                      className={`variant-option${current ? ' is-current' : ''}${v.stock <= 0 ? ' is-soldout' : ''}`}
                      aria-current={current ? 'true' : undefined}
                      title={`${v.label} – ${formatPrice(v.price)}${v.stock <= 0 ? ' (hết hàng)' : ''}`}
                    >
                      {v.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.imageUrl} alt="" width={36} height={36} loading="lazy" />
                      )}
                      <span>
                        {v.label}
                        <small>{v.stock <= 0 ? 'Hết hàng' : formatPrice(v.price)}</small>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {(product.isBulky || product.warrantyMonths) && (
            <div className="detail-tags">
              {product.isBulky && (
                <span className="badge tag-bulky" title={POLICY.bulky}>
                  <FontAwesomeIcon icon={faTruck} /> Hàng cồng kềnh · <FontAwesomeIcon icon={faScrewdriverWrench} /> Lắp đặt tận nơi miễn phí
                </span>
              )}
              {product.warrantyMonths && (
                <Link className="badge badge-ok" href="/warranty">
                  <FontAwesomeIcon icon={faShieldHalved} /> Bảo hành {formatWarranty(product.warrantyMonths)} · tra cứu điện tử
                </Link>
              )}
            </div>
          )}
          {product.isBulky && (
            <p className="bulky-note small">
              <FontAwesomeIcon icon={faTruck} /> Giao bằng xe tải nhỏ, 2 kỹ thuật viên mang lên tận phòng và lắp đặt. Phụ phí{' '}
              {formatPrice(SITE.bulkyFee.sameProvince)} – {formatPrice(SITE.bulkyFee.crossRegion)}/kiện tùy khu vực, không áp dụng miễn phí vận chuyển.
            </p>
          )}

          {product.highlights.length > 0 && (
            <ul className="highlights">
              {product.highlights.map((h) => (
                <li key={h}>
                  <FontAwesomeIcon icon={faCircleCheck} /> {h}
                </li>
              ))}
            </ul>
          )}

          <div className="buy-box">
            <div className="row">
              <StockBadge stock={product.stock} />
              {product.stock > 0 && (
                <span className="muted small">
                  <FontAwesomeIcon icon={faCubes} /> Còn {product.stock} sản phẩm
                </span>
              )}
            </div>
            <AddToCartButton productId={product.id} stock={product.stock} price={product.price} />
            <CompareButton item={{ slug: product.slug, name: product.name, imageUrl: product.imageUrl }} />
          </div>

          <ul className="perks">
            {PERKS.map((p) => (
              <li key={p.title}>
                <FontAwesomeIcon icon={p.icon} fixedWidth />
                <span>
                  <strong>{p.title}</strong>
                  <small>{p.text}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <div className="detail-sections">
        <section className="panel">
          <h2 className="panel-title">
            <span className="fa-icon-wrap">
              <FontAwesomeIcon icon={faClipboardList} />
            </span>
            Mô tả chi tiết
          </h2>
          <div className="prose">
            {product.description.split('\n\n').map((para) => (
              <p key={para.slice(0, 40)}>{para}</p>
            ))}
            {product.highlights.length > 0 && (
              <>
                <h3>Điểm nổi bật</h3>
                <ul>
                  {product.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </>
            )}
            {care.length > 0 && (
              <>
                <h3>Hướng dẫn sử dụng & bảo quản</h3>
                <ul>
                  {care.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        <aside className="stack">
          {specs.length > 0 && (
            <section className="panel">
              <h2 className="panel-title">
                <span className="fa-icon-wrap">
                  <FontAwesomeIcon icon={faListCheck} />
                </span>
                Thông số kỹ thuật
              </h2>
              <table className="spec-table">
                <tbody>
                  {specs.map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section className="panel">
            <h2 className="panel-title">
              <span className="fa-icon-wrap">
                <FontAwesomeIcon icon={faBoxOpen} />
              </span>
              Giao hàng & đổi trả
            </h2>
            <ul className="policy-list">
              <li>Giao 1–5 ngày tùy khu vực; phí và ngày nhận dự kiến hiển thị khi thanh toán. {POLICY.freeShip}.</li>
              <li>Được kiểm tra hàng trước khi thanh toán nếu chọn COD.</li>
              <li>{POLICY.returnsLong} (lỗi nhà sản xuất, giao sai mẫu…).</li>
              <li>Hỗ trợ kỹ thuật: {POLICY.support}.</li>
            </ul>
          </section>
        </aside>
      </div>

      <ReviewSection slug={product.slug} />

      {related.length > 0 && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>
                <FontAwesomeIcon icon={categoryIcon(product.category.slug)} /> Cùng danh mục {product.category.name}
              </h2>
              <p>Có thể bạn cũng thích</p>
            </div>
            <Link className="link" href={`/?category=${product.category.slug}#products`}>
              Xem tất cả <FontAwesomeIcon icon={faChevronRight} />
            </Link>
          </div>
          <div className="scroller">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
