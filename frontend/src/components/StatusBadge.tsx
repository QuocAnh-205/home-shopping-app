import { STATUS_LABEL, type OrderStatus } from '@/lib/types';

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
}
