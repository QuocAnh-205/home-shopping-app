import {
  faBan,
  faBoxOpen,
  faBoxesPacking,
  faCircleCheck,
  faHourglassHalf,
  faRotateLeft,
  faTruckFast,
  faWallet,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { STATUS_LABEL, type OrderStatus } from '@/lib/types';

export const STATUS_ICON: Record<OrderStatus, IconDefinition> = {
  AWAITING_PAYMENT: faWallet,
  PENDING: faHourglassHalf,
  PROCESSING: faBoxesPacking,
  SHIPPING: faTruckFast,
  DELIVERED: faBoxOpen,
  COMPLETED: faCircleCheck,
  CANCELLED: faBan,
  RETURN_REQUESTED: faRotateLeft,
  RETURNED: faRotateLeft,
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <FontAwesomeIcon icon={STATUS_ICON[status]} /> {STATUS_LABEL[status]}
    </span>
  );
}
