import Link from 'next/link';
import { formatPrice } from '@/lib/types';

export interface LineItem {
  key: string | number;
  name: string;
  slug: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  note?: string | null;
  /** Nhãn phụ (vd hàng cồng kềnh) */
  tag?: string | null;
}

/**
 * Danh sách sản phẩm của đơn / trang thanh toán dạng thẻ (thay cho bảng 4 cột):
 * trên điện thoại tên sản phẩm không bị bóp thành từng chữ một dòng.
 */
export function LineItems({ items }: { items: LineItem[] }) {
  return (
    <ul className="line-items">
      {items.map((i) => (
        <li key={i.key}>
          {i.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.imageUrl} alt="" width={56} height={56} loading="lazy" />
          ) : (
            <span className="line-items-thumb" aria-hidden />
          )}
          <div className="line-items-info">
            <Link className="link" href={`/products/${i.slug}`}>
              {i.name}
            </Link>
            <span className="muted small">
              {formatPrice(i.unitPrice)} × {i.quantity}
            </span>
            {i.note && <span className="badge badge-danger">{i.note}</span>}
            {i.tag && <span className="badge tag-bulky">{i.tag}</span>}
          </div>
          <strong className="line-items-total">{formatPrice(i.unitPrice * i.quantity)}</strong>
        </li>
      ))}
    </ul>
  );
}
