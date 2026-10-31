'use client';

import { faRotateRight, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { EmptyState } from '@/components/EmptyState';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState icon={faTriangleExclamation} title="Đã có lỗi xảy ra">
      <p>Hệ thống đang bận, vui lòng thử lại sau ít phút.</p>
      <button className="btn" onClick={reset}>
        <FontAwesomeIcon icon={faRotateRight} /> Thử lại
      </button>
    </EmptyState>
  );
}
