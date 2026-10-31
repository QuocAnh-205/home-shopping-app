import { faHouse, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';

export default function NotFound() {
  return (
    <EmptyState icon={faMagnifyingGlass} title="404 — Không tìm thấy trang">
      <p>Sản phẩm có thể đã ngừng kinh doanh hoặc đường dẫn không đúng.</p>
      <Link className="btn" href="/">
        <FontAwesomeIcon icon={faHouse} /> Về trang chủ
      </Link>
    </EmptyState>
  );
}
