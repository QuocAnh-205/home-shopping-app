import { faArrowRight, faFire, faTruck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { categoryIcon } from '@/lib/icons';
import { formatCompact, type Product } from '@/lib/types';
import { PriceTag } from './PriceTag';
import { ProductImage } from './ProductImage';
import { Stars } from './Stars';

export function ProductCard({ product, eager = false, rank }: { product: Product; eager?: boolean; rank?: number }) {
  return (
    <Link href={`/products/${product.slug}`} className="card">
      <div className="card-media">
        <ProductImage product={product} eager={eager} />
        <div className="card-tags">
          {rank !== undefined && <span className="badge tag-rank">#{rank}</span>}
          {product.discountPercent > 0 && <span className="badge tag-sale">-{product.discountPercent}%</span>}
          {product.isHot && (
            <span className="badge tag-hot">
              <FontAwesomeIcon icon={faFire} /> Hot
            </span>
          )}
          {product.isBulky && (
            <span className="badge tag-bulky" title="Hàng cồng kềnh – giao bằng xe tải nhỏ, lắp đặt tận nơi">
              <FontAwesomeIcon icon={faTruck} /> Lắp đặt tận nơi
            </span>
          )}
        </div>
        {product.stock <= 0 && <span className="card-soldout">Hết hàng</span>}
      </div>
      <div className="card-body">
        <span className="card-cat">
          <FontAwesomeIcon icon={categoryIcon(product.category?.slug)} /> {product.category?.name}
        </span>
        <h3 className="card-title">{product.name}</h3>
        <div className="card-meta">
          {product.ratingCount > 0 ? (
            <>
              <Stars value={product.ratingAvg} />
              <span className="muted small">({product.ratingCount})</span>
            </>
          ) : (
            <span className="muted small">Chưa có đánh giá</span>
          )}
          {product.soldCount > 0 && <span className="muted small sold">Đã bán {formatCompact(product.soldCount)}</span>}
        </div>
        <div className="card-foot">
          <PriceTag product={product} />
          <span className="card-go" aria-hidden>
            <FontAwesomeIcon icon={faArrowRight} />
          </span>
        </div>
        {product.stock > 0 && product.stock <= 5 && <span className="small warn">Chỉ còn {product.stock} sản phẩm</span>}
      </div>
    </Link>
  );
}
