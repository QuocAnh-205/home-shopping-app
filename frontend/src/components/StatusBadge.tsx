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

/** transferClaimed: khách đã bấm "Tôi đã chuyển khoản" → hiện "Chờ xác nhận thanh toán" thay vì "Chờ thanh toán" */
export function StatusBadge({ status, transferClaimed = false }: { status: OrderStatus; transferClaimed?: boolean }) {
  const confirming = status === 'AWAITING_PAYMENT' && transferClaimed;
  return (
    <span className={`badge status-${confirming ? 'processing' : status.toLowerCase()}`}>
      <FontAwesomeIcon icon={confirming ? faHourglassHalf : STATUS_ICON[status]} /> {confirming ? 'Chờ xác nhận thanh toán' : STATUS_LABEL[status]}
    </span>
  );
}
