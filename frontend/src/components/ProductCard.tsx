import Link from 'next/link';
import { formatPrice, type Product } from '@/lib/types';
import { ProductImage } from './ProductImage';
import { StockBadge } from './StockBadge';

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/products/${product.slug}`} className="card">
      <div className="card-media">
        <ProductImage product={product} />
        {product.isHot && <span className="ribbon">🔥 Bán chạy</span>}
      </div>
      <div className="card-body">
        <span className="muted small">{product.category?.name}</span>
        <strong className="card-title">{product.name}</strong>
        <span className="price">{formatPrice(product.price)}</span>
        <StockBadge stock={product.stock} />
      </div>
    </Link>
  );
}
