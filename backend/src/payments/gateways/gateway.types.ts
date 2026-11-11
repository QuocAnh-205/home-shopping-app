import { PaymentMethod } from '@prisma/client';

export interface CreatePaymentInput {
  txnRef: string;
  /** VND */
  amount: number;
  orderId: string;
  /** Mô tả hiển thị trên trang cổng: "Thanh toan don hang #ABCD1234" (không dấu cho VNPay) */
  orderInfo: string;
  expiresAt: Date;
  /** Trang kết quả (chỉ để HIỂN THỊ, không đổi trạng thái đơn) */
  returnUrl: string;
  /** Server cổng gọi về để xác nhận (IPN/webhook) – nơi DUY NHẤT đổi trạng thái thanh toán */
  ipnUrl: string;
  clientIp: string;
}

export interface VietQrData {
  bankBin: string;
  accountNo: string;
  accountName: string;
  amount: number;
  /** Nội dung chuyển khoản bắt buộc (để đối soát) */
  content: string;
  imageUrl: string;
}

export interface CreatePaymentResult {
  payUrl?: string;
  qr?: VietQrData;
  /** Lưu vào payments.raw_create (không chứa khóa bí mật) */
  raw?: unknown;
}

/** Kết quả IPN đã kiểm chữ ký */
export interface GatewayNotification {
  txnRef: string;
  amount: number;
  success: boolean;
  gatewayTxnId?: string;
  message?: string;
  raw: unknown;
}

export type AckKind = 'ok' | 'duplicate' | 'not_found' | 'invalid_amount' | 'invalid_signature' | 'error';

export interface RefundInput {
  txnRef: string;
  gatewayTxnId: string | null;
  amount: number;
  /** Lúc tạo giao dịch thanh toán (VNPay cần vnp_TransactionDate) */
  paymentCreatedAt: Date;
  rawCreate: unknown;
  reason: string;
  clientIp: string;
}

export interface RefundResult {
  ok: boolean;
  gatewayRefundId?: string;
  error?: string;
  raw?: unknown;
}

/**
 * Interface chung cho mọi cổng thanh toán. Thêm cổng mới (ZaloPay, Stripe…) = viết 1 class implement interface này
 * và đăng ký trong PaymentGatewayRegistry — không phải sửa luồng đặt hàng / IPN / hoàn tiền.
 */
export interface PaymentGateway {
  readonly method: PaymentMethod;
  /** true = đủ cấu hình (khóa trong biến môi trường) */
  readonly configured: boolean;
  /** Cổng giả lập (sandbox nội bộ) khi chưa có khóa thật */
  readonly mock?: boolean;
  /** Có hoàn tiền tự động qua API không (VietQR: không → hoàn tay) */
  readonly supportsRefund: boolean;
  create(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Kiểm chữ ký IPN. null = chữ ký sai / thiếu dữ liệu */
  verifyNotification(payload: Record<string, unknown>): GatewayNotification | null;
  /** Lấy txnRef từ payload chưa kiểm chữ ký (chỉ để ghi nhật ký) */
  peekTxnRef(payload: Record<string, unknown>): string | null;
  /** Body/HTTP status trả lời server cổng theo đặc tả của cổng đó */
  ack(kind: AckKind): { status: number; body: unknown };
  refund?(input: RefundInput): Promise<RefundResult>;
}
