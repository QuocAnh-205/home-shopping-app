import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { categoryIcon } from '@/lib/icons';
import type { Product } from '@/lib/types';

/** Ảnh sản phẩm (file tĩnh hoặc presigned URL S3); chưa có ảnh → icon danh mục trên nền gradient */
export function ProductImage({ product, eager = false }: { product: Pick<Product, 'name' | 'imageUrl' | 'category'>; eager?: boolean }) {
  if (product.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="product-img"
        src={product.imageUrl}
        alt={product.name}
        width={1200}
        height={900}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={eager ? 'high' : undefined}
      />
    );
  }
  return (
    <div className="product-img placeholder" role="img" aria-label={product.name}>
      <FontAwesomeIcon icon={categoryIcon(product.category?.slug)} />
    </div>
  );
}
