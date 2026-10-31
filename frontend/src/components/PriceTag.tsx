import { formatPrice, type Product } from '@/lib/types';

/** Giá bán + giá gốc gạch ngang + % giảm */
export function PriceTag({ product, large = false }: { product: Pick<Product, 'price' | 'compareAtPrice' | 'discountPercent'>; large?: boolean }) {
  return (
    <span className={`price-tag ${large ? 'price-tag-lg' : ''}`}>
      <span className="price">{formatPrice(product.price)}</span>
      {product.compareAtPrice && (
        <>
          <s className="price-old" aria-label={`Giá gốc ${formatPrice(product.compareAtPrice)}`}>
            {formatPrice(product.compareAtPrice)}
          </s>
          {large && <span className="badge badge-sale">-{product.discountPercent}%</span>}
        </>
      )}
    </span>
  );
}
