import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PaymentMethod } from '@prisma/client';
import { AckKind, CreatePaymentInput, CreatePaymentResult, GatewayNotification, PaymentGateway, RefundInput, RefundResult } from './gateway.types';

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  payUrl: string;
  apiUrl: string;
}

/** yyyyMMddHHmmss theo giờ Việt Nam (GMT+7) – định dạng ngày của VNPay */
export function vnpDate(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/** Chuẩn mã hóa query của VNPay: sắp xếp key, encodeURIComponent và đổi %20 thành "+" */
export function vnpQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
}

export function hmacSha512(secret: string, data: string): string {
  return createHmac('sha512', secret).update(data, 'utf8').digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), 'utf8');
  const y = Buffer.from(b.toLowerCase(), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Bỏ dấu tiếng Việt (vnp_OrderInfo chỉ nhận ký tự không dấu) */
export function stripVietnamese(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 #:._-]/g, '');
}

/**
 * VNPay (API 2.1.0, sandbox: https://sandbox.vnpayment.vn).
 * - Tạo URL thanh toán ký HMAC-SHA512; số tiền ×100.
 * - IPN (GET) cấu hình URL trong cổng merchant VNPay: kiểm vnp_SecureHash, trả {RspCode, Message}.
 * - Hoàn tiền: merchant_webapi/api/transaction, command=refund.
 */
export class VnpayGateway implements PaymentGateway {
  readonly method = PaymentMethod.VNPAY;
  readonly supportsRefund = true;
  readonly configured: boolean;

  constructor(
    private readonly cfg: VnpayConfig,
    private readonly http: typeof fetch = fetch,
  ) {
    this.configured = Boolean(cfg.tmnCode && cfg.hashSecret);
  }

  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const createDate = vnpDate(new Date());
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.cfg.tmnCode,
      vnp_Amount: String(input.amount * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: stripVietnamese(input.orderInfo),
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: input.returnUrl,
      vnp_IpAddr: input.clientIp || '127.0.0.1',
      vnp_CreateDate: createDate,
      vnp_ExpireDate: vnpDate(input.expiresAt),
    };
    const query = vnpQuery(params);
    const payUrl = `${this.cfg.payUrl}?${query}&vnp_SecureHash=${hmacSha512(this.cfg.hashSecret, query)}`;
    // Lưu vnp_CreateDate: API hoàn tiền yêu cầu vnp_TransactionDate = ngày tạo giao dịch gốc
    return { payUrl, raw: { vnp_CreateDate: createDate, vnp_TxnRef: input.txnRef, vnp_Amount: params.vnp_Amount } };
  }

  peekTxnRef(payload: Record<string, unknown>): string | null {
    return typeof payload.vnp_TxnRef === 'string' ? payload.vnp_TxnRef : null;
  }

  verifyNotification(payload: Record<string, unknown>): GatewayNotification | null {
    const received = payload.vnp_SecureHash;
    if (typeof received !== 'string' || !received) return null;
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k.startsWith('vnp_') && k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType' && typeof v === 'string') params[k] = v;
    }
    if (!safeEqualHex(hmacSha512(this.cfg.hashSecret, vnpQuery(params)), received)) return null;
    if (params.vnp_TmnCode !== this.cfg.tmnCode || !params.vnp_TxnRef || !/^\d+$/.test(params.vnp_Amount ?? '')) return null;
    return {
      txnRef: params.vnp_TxnRef,
      amount: Number(params.vnp_Amount) / 100,
      success: params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00',
      gatewayTxnId: params.vnp_TransactionNo,
      message: `ResponseCode=${params.vnp_ResponseCode} TransactionStatus=${params.vnp_TransactionStatus}`,
      raw: params,
    };
  }

  ack(kind: AckKind): { status: number; body: unknown } {
    const map: Record<AckKind, [string, string]> = {
      ok: ['00', 'Confirm Success'],
      duplicate: ['02', 'Order already confirmed'],
      not_found: ['01', 'Order not found'],
      invalid_amount: ['04', 'Invalid amount'],
      invalid_signature: ['97', 'Invalid Checksum'],
      error: ['99', 'Unknown error'],
    };
    const [RspCode, Message] = map[kind];
    return { status: 200, body: { RspCode, Message } };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const raw = (input.rawCreate ?? {}) as { vnp_CreateDate?: string };
    const body: Record<string, string> = {
      vnp_RequestId: randomUUID().replace(/-/g, '').slice(0, 32),
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: this.cfg.tmnCode,
      vnp_TransactionType: '02',
      vnp_TxnRef: input.txnRef,
      vnp_Amount: String(input.amount * 100),
      vnp_TransactionNo: input.gatewayTxnId ?? '',
      vnp_TransactionDate: raw.vnp_CreateDate ?? vnpDate(input.paymentCreatedAt),
      vnp_CreateBy: 'home-shopping',
      vnp_CreateDate: vnpDate(new Date()),
      vnp_IpAddr: input.clientIp || '127.0.0.1',
      vnp_OrderInfo: stripVietnamese(`Hoan tien ${input.txnRef}: ${input.reason}`).slice(0, 255),
    };
    const order = [
      'vnp_RequestId',
      'vnp_Version',
      'vnp_Command',
      'vnp_TmnCode',
      'vnp_TransactionType',
      'vnp_TxnRef',
      'vnp_Amount',
      'vnp_TransactionNo',
      'vnp_TransactionDate',
      'vnp_CreateBy',
      'vnp_CreateDate',
      'vnp_IpAddr',
      'vnp_OrderInfo',
    ];
    body.vnp_SecureHash = hmacSha512(this.cfg.hashSecret, order.map((k) => body[k]).join('|'));
    const res = await this.http(this.cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => ({}))) as { vnp_ResponseCode?: string; vnp_Message?: string; vnp_TransactionNo?: string };
    return json.vnp_ResponseCode === '00'
      ? { ok: true, gatewayRefundId: json.vnp_TransactionNo, raw: json }
      : { ok: false, error: `VNPay refund ${json.vnp_ResponseCode ?? res.status}: ${json.vnp_Message ?? 'unknown'}`, raw: json };
  }
}
