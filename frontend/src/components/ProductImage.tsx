import { categoryIcon, type Product } from '@/lib/types';

/** Ảnh sản phẩm từ S3 (presigned URL); chưa có ảnh → minh họa theo danh mục */
export function ProductImage({ product, large = false }: { product: Product; large?: boolean }) {
  if (product.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="product-img" src={product.imageUrl} alt={product.name} loading={large ? 'eager' : 'lazy'} />;
  }
  return (
    <div className={`product-img placeholder cat-${product.category?.slug ?? 'default'}`} aria-hidden>
      <span style={{ fontSize: large ? '6rem' : '3rem' }}>{categoryIcon(product.category?.slug)}</span>
    </div>
  );
}
