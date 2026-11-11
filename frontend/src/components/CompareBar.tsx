'use client';

import { faCodeCompare, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clearCompare, removeCompare, useCompare } from '@/lib/compare';

/** Thanh nổi đáy màn hình khi đang có sản phẩm trong danh sách so sánh */
export function CompareBar() {
  const list = useCompare();
  const pathname = usePathname();
  if (list.length === 0 || pathname === '/compare' || pathname.startsWith('/admin') || pathname.startsWith('/checkout')) return null;

  return (
    <aside className="compare-bar" aria-label="Danh sách so sánh">
      <ul className="compare-bar-items">
        {list.map((i) => (
          <li key={i.slug} title={i.name}>
            {i.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.imageUrl} alt={i.name} width={40} height={40} />
            ) : (
              <span className="compare-bar-thumb" />
            )}
            <button type="button" aria-label={`Bỏ ${i.name} khỏi so sánh`} onClick={() => removeCompare(i.slug)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="link-btn small compare-bar-clear" onClick={clearCompare}>
        Xóa hết
      </button>
      <Link href="/compare" className={`btn btn-sm${list.length < 2 ? ' is-disabled' : ''}`} aria-disabled={list.length < 2}>
        <FontAwesomeIcon icon={faCodeCompare} /> So sánh ({list.length})
      </Link>
    </aside>
  );
}
