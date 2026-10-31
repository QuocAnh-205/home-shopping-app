import { faBan, faCircleCheck, faCreditCard, faHourglassHalf, faTruckFast } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { STATUS_LABEL, type OrderStatus } from '@/lib/types';

export const STATUS_ICON: Record<OrderStatus, IconDefinition> = {
  PENDING: faHourglassHalf,
  PAID: faCreditCard,
  SHIPPING: faTruckFast,
  COMPLETED: faCircleCheck,
  CANCELLED: faBan,
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <FontAwesomeIcon icon={STATUS_ICON[status]} /> {STATUS_LABEL[status]}
    </span>
  );
}
