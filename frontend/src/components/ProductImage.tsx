import type { Product } from '@/lib/types';

/**
 * Ảnh sản phẩm (ảnh tĩnh, ảnh upload local hoặc presigned URL S3).
 * Không bao giờ dùng icon thay ảnh: sản phẩm chưa có ảnh hiển thị khung trung tính kèm tên sản phẩm.
 */
export function ProductImage({ product, eager = false }: { product: Pick<Product, 'name' | 'imageUrl'>; eager?: boolean }) {
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
    <div className="product-img no-image" role="img" aria-label={`${product.name} – ảnh đang được cập nhật`}>
      <span>{product.name}</span>
      <small>Ảnh đang được cập nhật</small>
    </div>
  );
}
