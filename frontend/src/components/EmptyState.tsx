import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ReactNode } from 'react';

export function EmptyState({ icon, title, children }: { icon: IconDefinition; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ico" aria-hidden>
        <FontAwesomeIcon icon={icon} />
      </span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
