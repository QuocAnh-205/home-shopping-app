import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AddToCartButton } from '@/components/AddToCartButton';
import { ProductImage } from '@/components/ProductImage';
import { StockBadge } from '@/components/StockBadge';
import { ApiError, getProduct } from '@/lib/server-api';
import { formatPrice, type Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Props {
  params: { slug: string };
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
  const product = await load(params.slug);
  return { title: product.name, description: product.description.slice(0, 160) };
}

export default async function ProductPage({ params }: Props) {
  const product = await load(params.slug);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Trang chủ</Link> ›{' '}
        <Link href={`/?category=${product.category.slug}`}>{product.category.name}</Link> › <span>{product.name}</span>
      </nav>
      <article className="panel product-detail">
        <div className="product-detail-media">
          <ProductImage product={product} large />
        </div>
        <div className="product-detail-info">
          {product.isHot && <span className="badge badge-danger">🔥 Bán chạy</span>}
          <h1>{product.name}</h1>
          <p className="price price-lg">{formatPrice(product.price)}</p>
          <StockBadge stock={product.stock} />
          <p className="description">{product.description}</p>
          <ul className="perks">
            <li>🚚 Giao nhanh 2h nội thành</li>
            <li>↩️ Đổi trả miễn phí 30 ngày</li>
            <li>💵 Thanh toán khi nhận hàng (COD)</li>
          </ul>
          <AddToCartButton productId={product.id} stock={product.stock} />
        </div>
      </article>
    </>
  );
}
