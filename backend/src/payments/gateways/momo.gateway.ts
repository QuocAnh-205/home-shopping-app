import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PaymentMethod } from '@prisma/client';
import { AckKind, CreatePaymentInput, CreatePaymentResult, GatewayNotification, PaymentGateway, RefundInput, RefundResult } from './gateway.types';

export interface MomoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  /** Sandbox: https://test-payment.momo.vn */
  endpoint: string;
}

export function hmacSha256(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), 'utf8');
  const y = Buffer.from(b.toLowerCase(), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Chuỗi ký của MoMo: các trường theo đúng thứ tự alphabet, dạng key=value nối bằng & */
export function momoRaw(fields: Record<string, string | number>, keys: string[]): string {
  return keys.map((k) => `${k}=${fields[k] ?? ''}`).join('&');
}

const IPN_KEYS = ['accessKey', 'amount', 'extraData', 'message', 'orderId', 'orderInfo', 'orderType', 'partnerCode', 'payType', 'requestId', 'responseTime', 'resultCode', 'transId'];

/**
 * Ví MoMo (API v2 "captureWallet", sandbox test-payment.momo.vn).
 * - Tạo giao dịch: POST /v2/gateway/api/create, ký HMAC-SHA256 → nhận payUrl.
 * - IPN: POST JSON về ipnUrl, kiểm chữ ký, trả HTTP 204.
 * - Hoàn tiền: POST /v2/gateway/api/refund.
 */
export class MomoGateway implements PaymentGateway {
  readonly method = PaymentMethod.MOMO;
  readonly supportsRefund = true;
  readonly configured: boolean;

  constructor(
    private readonly cfg: MomoConfig,
    private readonly http: typeof fetch = fetch,
  ) {
    this.configured = Boolean(cfg.partnerCode && cfg.accessKey && cfg.secretKey);
  }

  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const fields = {
      accessKey: this.cfg.accessKey,
      amount: input.amount,
      extraData: '',
      ipnUrl: input.ipnUrl,
      orderId: input.txnRef,
      orderInfo: input.orderInfo,
      partnerCode: this.cfg.partnerCode,
      redirectUrl: input.returnUrl,
      requestId: randomUUID(),
      requestType: 'captureWallet',
    };
    const signature = hmacSha256(this.cfg.secretKey, momoRaw(fields, Object.keys(fields).sort()));
    const { accessKey: _hidden, ...body } = fields;
    const minutes = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60_000));
    const res = await this.http(`${this.cfg.endpoint}/v2/gateway/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, lang: 'vi', orderExpireTime: minutes, signature }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { resultCode?: number; message?: string; payUrl?: string };
    if (json.resultCode !== 0 || !json.payUrl) throw new Error(`MoMo create ${json.resultCode ?? res.status}: ${json.message ?? 'unknown'}`);
    return { payUrl: json.payUrl, raw: { requestId: fields.requestId, resultCode: json.resultCode, message: json.message } };
  }

  peekTxnRef(payload: Record<string, unknown>): string | null {
    return typeof payload.orderId === 'string' ? payload.orderId : null;
  }

  verifyNotification(payload: Record<string, unknown>): GatewayNotification | null {
    const sig = payload.signature;
    if (typeof sig !== 'string' || payload.partnerCode !== this.cfg.partnerCode) return null;
    const fields: Record<string, string | number> = { accessKey: this.cfg.accessKey };
    for (const k of IPN_KEYS.slice(1)) {
      const v = payload[k];
      if (v !== undefined && typeof v !== 'string' && typeof v !== 'number') return null;
      fields[k] = (v as string | number | undefined) ?? '';
    }
    if (!safeEqualHex(hmacSha256(this.cfg.secretKey, momoRaw(fields, IPN_KEYS)), sig)) return null;
    const amount = Number(fields.amount);
    if (!Number.isInteger(amount) || typeof payload.orderId !== 'string') return null;
    return {
      txnRef: payload.orderId,
      amount,
      success: Number(fields.resultCode) === 0,
      gatewayTxnId: String(fields.transId),
      message: `resultCode=${fields.resultCode} ${fields.message}`,
      raw: payload,
    };
  }

  /** MoMo chỉ cần HTTP 204 khi đã nhận; lỗi chữ ký trả 400 để MoMo ghi nhận */
  ack(kind: AckKind): { status: number; body: unknown } {
    return kind === 'invalid_signature' ? { status: 400, body: { message: 'invalid signature' } } : { status: 204, body: undefined };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const fields = {
      accessKey: this.cfg.accessKey,
      amount: input.amount,
      description: input.reason.slice(0, 200),
      orderId: `RF${input.txnRef}${Date.now().toString(36)}`.slice(0, 50),
      partnerCode: this.cfg.partnerCode,
      requestId: randomUUID(),
      transId: input.gatewayTxnId ?? '',
    };
    const signature = hmacSha256(this.cfg.secretKey, momoRaw(fields, Object.keys(fields).sort()));
    const { accessKey: _hidden, ...body } = fields;
    const res = await this.http(`${this.cfg.endpoint}/v2/gateway/api/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, transId: Number(fields.transId) || fields.transId, lang: 'vi', signature }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { resultCode?: number; message?: string; transId?: number | string };
    return json.resultCode === 0
      ? { ok: true, gatewayRefundId: String(json.transId ?? ''), raw: json }
      : { ok: false, error: `MoMo refund ${json.resultCode ?? res.status}: ${json.message ?? 'unknown'}`, raw: json };
  }
}
