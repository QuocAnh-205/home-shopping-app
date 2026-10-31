import { faChevronRight, faCubes, faHouse, faMoneyBillWave, faRotateLeft, faShieldHalved, faTruckFast } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AddToCartButton } from '@/components/AddToCartButton';
import { ProductCard } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { StockBadge } from '@/components/StockBadge';
import { categoryIcon } from '@/lib/icons';
import { ApiError, getProduct, getProducts } from '@/lib/server-api';
import { formatPrice, type Product } from '@/lib/types';

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
  { icon: faTruckFast, text: 'Giao nhanh 2 giờ nội thành' },
  { icon: faRotateLeft, text: 'Đổi trả miễn phí 30 ngày' },
  { icon: faShieldHalved, text: 'Bảo hành chính hãng 12 tháng' },
  { icon: faMoneyBillWave, text: 'Thanh toán khi nhận hàng' },
];

export default async function ProductPage({ params }: Props) {
  const product = await load((await params).slug);
  const related = await getProducts({ page: 1, category: product.category.slug })
    .then((r) => r.items.filter((p) => p.id !== product.id).slice(0, 4))
    .catch(() => []);

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
        </div>

        <div className="detail-info">
          <span className="card-cat">
            <FontAwesomeIcon icon={categoryIcon(product.category.slug)} /> {product.category.name}
            {product.isHot && <span className="badge tag-hot">Bán chạy</span>}
          </span>
          <h1>{product.name}</h1>
          <div className="row">
            <span className="price price-lg">{formatPrice(product.price)}</span>
            <StockBadge stock={product.stock} />
          </div>
          <p className="description">{product.description}</p>

          <div className="buy-box">
            <AddToCartButton productId={product.id} stock={product.stock} />
            {product.stock > 0 && (
              <span className="muted small">
                <FontAwesomeIcon icon={faCubes} /> Còn {product.stock} sản phẩm trong kho
              </span>
            )}
          </div>

          <ul className="perks">
            {PERKS.map((p) => (
              <li key={p.text}>
                <FontAwesomeIcon icon={p.icon} fixedWidth /> {p.text}
              </li>
            ))}
          </ul>
        </div>
      </article>

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
          <div className="grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
