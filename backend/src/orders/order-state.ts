import { HttpStatus } from '@nestjs/common';
import { ActorType, OrderStatus } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';

/**
 * State machine đơn hàng. Mỗi bước chuyển chỉ hợp lệ với một số "vai" (khách / admin / hệ thống).
 * Chặn ở tầng service: controller nào gọi tới cũng phải qua assertTransition.
 *
 *   AWAITING_PAYMENT ──(thanh toán xong / đổi sang COD)──▶ PENDING ──▶ PROCESSING ──▶ SHIPPING ──▶ DELIVERED ──▶ COMPLETED
 *         │                                                  │            │                          │              │
 *         └──────────────────────────▶ CANCELLED ◀───────────┴────────────┘                          └──▶ RETURN_REQUESTED ──▶ RETURNED
 *                                                                                                                │
 *                                                                                                   (từ chối) ───┴──▶ COMPLETED
 */
const { CUSTOMER, ADMIN, SYSTEM } = ActorType;

export const ORDER_RULES: Readonly<Record<OrderStatus, Partial<Record<OrderStatus, readonly ActorType[]>>>> = {
  AWAITING_PAYMENT: {
    // SYSTEM: IPN xác nhận đã trả tiền · CUSTOMER: đổi sang COD
    PENDING: [SYSTEM, CUSTOMER],
    // SYSTEM: hết 15 phút giữ hàng
    CANCELLED: [CUSTOMER, ADMIN, SYSTEM],
  },
  PENDING: {
    // SYSTEM: chế độ demo TRANSFER_AUTO_CONFIRM tự xác nhận đơn ngay sau khi xác nhận thanh toán
    PROCESSING: [ADMIN, SYSTEM],
    CANCELLED: [CUSTOMER, ADMIN, SYSTEM],
  },
  PROCESSING: {
    SHIPPING: [ADMIN],
    // Khách không tự hủy khi shop đã chuẩn bị hàng (giống Shopee: phải liên hệ shop)
    CANCELLED: [ADMIN],
  },
  SHIPPING: {
    // CUSTOMER: bấm "Đã nhận hàng" khi đang giao
    DELIVERED: [ADMIN, SYSTEM, CUSTOMER],
  },
  DELIVERED: {
    COMPLETED: [CUSTOMER, ADMIN, SYSTEM],
    RETURN_REQUESTED: [CUSTOMER],
  },
  COMPLETED: {
    // Trong thời hạn trả hàng (RETURN_WINDOW_DAYS tính từ lúc giao) – kiểm tra ở service
    RETURN_REQUESTED: [CUSTOMER],
  },
  RETURN_REQUESTED: {
    RETURNED: [ADMIN],
    // Admin từ chối yêu cầu trả hàng
    COMPLETED: [ADMIN],
  },
  CANCELLED: {},
  RETURNED: {},
};

/** Giữ tên cũ cho frontend admin: các trạng thái kế tiếp hợp lệ (mọi vai) */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.fromEntries(
  Object.entries(ORDER_RULES).map(([from, next]) => [from, Object.keys(next) as OrderStatus[]]),
) as Record<OrderStatus, OrderStatus[]>;

export const STATUS_LABEL_VI: Readonly<Record<OrderStatus, string>> = {
  AWAITING_PAYMENT: 'Chờ thanh toán',
  PENDING: 'Chờ xác nhận',
  PROCESSING: 'Đang chuẩn bị hàng',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  RETURN_REQUESTED: 'Yêu cầu trả hàng/hoàn tiền',
  RETURNED: 'Đã trả hàng/hoàn tiền',
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: ActorType): boolean {
  return ORDER_RULES[from][to]?.includes(actor) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus, actor: ActorType): void {
  if (canTransition(from, to, actor)) return;
  throw new AppError(
    ErrorCode.INVALID_TRANSITION,
    `Không thể chuyển đơn từ "${STATUS_LABEL_VI[from]}" sang "${STATUS_LABEL_VI[to]}"`,
    HttpStatus.CONFLICT,
    { from, to },
  );
}

/** Trạng thái kết thúc: không còn bước chuyển nào */
export function isFinal(status: OrderStatus): boolean {
  return Object.keys(ORDER_RULES[status]).length === 0;
}

/** Trạng thái làm hoàn kho (hàng quay lại kho) */
export const RESTOCK_STATUSES: readonly OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.RETURNED];

/** Doanh thu: đơn đã được shop xác nhận và không bị hủy / trả */
export const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPING,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
  OrderStatus.RETURN_REQUESTED,
];
