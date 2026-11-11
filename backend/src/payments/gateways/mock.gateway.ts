import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentMethod } from '@prisma/client';
import { AckKind, CreatePaymentInput, CreatePaymentResult, GatewayNotification, PaymentGateway, RefundResult } from './gateway.types';

/**
 * Cổng GIẢ LẬP (sandbox nội bộ) cho VNPay/MoMo khi chưa có khóa thật – để demo đủ luồng thanh toán online.
 * - payUrl trỏ tới trang /payment/mock của web, mang chữ ký HMAC do server cấp (không làm giả được link).
 * - Trang đó gọi POST /api/payments/mock/notify → đi qua ĐÚNG luồng xử lý IPN như cổng thật
 *   (kiểm chữ ký, idempotent, đối chiếu số tiền).
 * Chỉ bật khi PAYMENT_MOCK_ENABLED=true; có khóa thật của cổng thì cổng thật được dùng thay thế.
 */
export class MockGateway implements PaymentGateway {
  readonly configured = true;
  readonly mock = true;
  readonly supportsRefund = true;

  constructor(
    readonly method: PaymentMethod,
    private readonly secret: string,
    private readonly appUrl: string,
  ) {}

  sign(txnRef: string, amount: number, result?: string): string {
    return createHmac('sha256', this.secret)
      .update(`${this.method}|${txnRef}|${amount}${result ? `|${result}` : ''}`)
      .digest('hex');
  }

  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const q = new URLSearchParams({
      method: this.method,
      ref: input.txnRef,
      amount: String(input.amount),
      order: input.orderId,
      sig: this.sign(input.txnRef, input.amount),
    });
    return { payUrl: `${this.appUrl}/payment/mock?${q.toString()}`, raw: { mock: true } };
  }

  peekTxnRef(payload: Record<string, unknown>): string | null {
    return typeof payload.txnRef === 'string' ? payload.txnRef : null;
  }

  /** payload: { txnRef, amount, result: 'success' | 'failed', sig } với sig = chữ ký của link thanh toán */
  verifyNotification(payload: Record<string, unknown>): GatewayNotification | null {
    const { txnRef, amount, result, sig } = payload;
    if (typeof txnRef !== 'string' || typeof sig !== 'string' || typeof amount !== 'number' || (result !== 'success' && result !== 'failed')) return null;
    const expected = Buffer.from(this.sign(txnRef, amount));
    const got = Buffer.from(sig);
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
    return { txnRef, amount, success: result === 'success', gatewayTxnId: `MOCK${Date.now()}`, message: `mock ${result}`, raw: { txnRef, amount, result } };
  }

  ack(kind: AckKind): { status: number; body: unknown } {
    return { status: kind === 'invalid_signature' ? 400 : 200, body: { result: kind } };
  }

  async refund(): Promise<RefundResult> {
    return { ok: true, gatewayRefundId: `MOCKRF${Date.now()}`, raw: { mock: true } };
  }
}
