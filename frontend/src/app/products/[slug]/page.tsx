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
  faTruckFast,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AddToCartButton } from '@/components/AddToCartButton';
import { PriceTag } from '@/components/PriceTag';
import { ProductCard } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { ReviewSection } from '@/components/ReviewSection';
import { Stars } from '@/components/Stars';
import { StockBadge } from '@/components/StockBadge';
import { CARE_GUIDE, categoryIcon } from '@/lib/icons';
import { ApiError, getProduct, getProducts } from '@/lib/server-api';
import { formatCompact, formatPrice, type Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

// cache(): generateMetadata và page dùng chung 1 lần gọi API trong cùng request
const load = cache(async (slug: string): Promise<Product> => {
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
  { icon: faTruckFast, title: 'Giao nhanh toàn quốc', text: 'Miễn phí vận chuyển đơn từ 500K' },
  { icon: faRotateLeft, title: 'Trả hàng 15 ngày', text: 'Yêu cầu ngay trong Đơn mua, hoàn tiền nhanh' },
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
              <li>Giao 1–5 ngày tùy khu vực; phí và ngày nhận dự kiến hiển thị khi thanh toán. Miễn phí vận chuyển đơn từ 500.000₫.</li>
              <li>Được kiểm tra hàng trước khi thanh toán nếu chọn COD.</li>
              <li>Trả hàng/hoàn tiền trong 15 ngày kể từ khi nhận hàng (lỗi nhà sản xuất, giao sai mẫu…).</li>
              <li>Hỗ trợ kỹ thuật 8:00 – 21:00 mỗi ngày.</li>
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
