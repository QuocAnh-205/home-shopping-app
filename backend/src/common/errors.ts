import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Mã lỗi nghiệp vụ ổn định cho frontend: hiển thị đúng thông báo / xử lý riêng (vd. giá thay đổi → hiện lại bảng giá).
 * Mọi lỗi trả về dạng { statusCode, code, message, details?, path, requestId, timestamp }.
 */
export const ErrorCode = {
  // Chung
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Đặt hàng
  CART_EMPTY: 'CART_EMPTY',
  NO_ITEMS_SELECTED: 'NO_ITEMS_SELECTED',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  PRICE_CHANGED: 'PRICE_CHANGED',
  ADDRESS_REQUIRED: 'ADDRESS_REQUIRED',
  ADDRESS_NOT_FOUND: 'ADDRESS_NOT_FOUND',
  ADDRESS_INVALID: 'ADDRESS_INVALID',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  // Voucher
  VOUCHER_NOT_FOUND: 'VOUCHER_NOT_FOUND',
  VOUCHER_NOT_APPLICABLE: 'VOUCHER_NOT_APPLICABLE',
  VOUCHER_EXHAUSTED: 'VOUCHER_EXHAUSTED',
  VOUCHER_USER_LIMIT: 'VOUCHER_USER_LIMIT',
  VOUCHER_CONFLICT: 'VOUCHER_CONFLICT',
  // Thanh toán
  PAYMENT_METHOD_UNAVAILABLE: 'PAYMENT_METHOD_UNAVAILABLE',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  PAYMENT_NOT_ALLOWED: 'PAYMENT_NOT_ALLOWED',
  PAYMENT_GATEWAY_ERROR: 'PAYMENT_GATEWAY_ERROR',
  REFUND_FAILED: 'REFUND_FAILED',
  // Đơn hàng
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  ORDER_CONCURRENT_UPDATE: 'ORDER_CONCURRENT_UPDATE',
  RETURN_NOT_ALLOWED: 'RETURN_NOT_ALLOWED',
  RETURN_NOT_FOUND: 'RETURN_NOT_FOUND',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Lỗi nghiệp vụ có mã + thông báo tiếng Việt (+ dữ liệu kèm theo cho frontend) */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

/** Mã mặc định khi lỗi không mang mã riêng (lỗi cũ của Nest, ValidationPipe, Throttler…) */
export function defaultCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.BAD_REQUEST;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.TOO_MANY_REQUESTS;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
  }
}
