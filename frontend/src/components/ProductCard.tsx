import { faArrowRight, faFire } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { categoryIcon } from '@/lib/icons';
import { formatPrice, type Product } from '@/lib/types';
import { ProductImage } from './ProductImage';
import { StockBadge } from './StockBadge';

export function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  return (
    <Link href={`/products/${product.slug}`} className="card">
      <div className="card-media">
        <ProductImage product={product} eager={eager} />
        <div className="card-tags">
          {product.isHot && (
            <span className="badge tag-hot">
              <FontAwesomeIcon icon={faFire} /> Bán chạy
            </span>
          )}
          {product.stock <= 0 && <span className="badge tag-out">Hết hàng</span>}
        </div>
      </div>
      <div className="card-body">
        <span className="card-cat">
          <FontAwesomeIcon icon={categoryIcon(product.category?.slug)} /> {product.category?.name}
        </span>
        <h3 className="card-title">{product.name}</h3>
        <StockBadge stock={product.stock} />
        <div className="card-foot">
          <span className="price">{formatPrice(product.price)}</span>
          <span className="card-go" aria-hidden>
            <FontAwesomeIcon icon={faArrowRight} />
          </span>
        </div>
      </div>
    </Link>
  );
}
