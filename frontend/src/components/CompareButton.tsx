'use client';

import { faCodeCompare, faCheck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState } from 'react';
import { COMPARE_MAX, toggleCompare, useCompare, type CompareItem } from '@/lib/compare';

export function CompareButton({ item }: { item: CompareItem }) {
  const list = useCompare();
  const [full, setFull] = useState(false);
  const added = list.some((i) => i.slug === item.slug);

  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost btn-sm compare-btn${added ? ' is-added' : ''}`}
        aria-pressed={added}
        onClick={() => setFull(!toggleCompare(item))}
      >
        <FontAwesomeIcon icon={added ? faCheck : faCodeCompare} /> {added ? 'Đã thêm vào so sánh' : 'So sánh'}
      </button>
      {full && !added && <span className="small warn">Tối đa {COMPARE_MAX} sản phẩm, hãy bỏ bớt ở thanh so sánh bên dưới.</span>}
    </>
  );
}
