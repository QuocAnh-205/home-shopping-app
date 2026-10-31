'use client';

import { faArrowDownWideShort } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SORT_OPTIONS } from '@/lib/types';

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(sort: string) {
    const next = new URLSearchParams(params.toString());
    if (sort === 'newest') next.delete('sort');
    else next.set('sort', sort);
    next.delete('page');
    const qs = next.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ''}#products`, { scroll: false });
  }

  return (
    <label className="sort">
      <FontAwesomeIcon icon={faArrowDownWideShort} />
      <span className="sr-only">Sắp xếp</span>
      <select className="input input-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
