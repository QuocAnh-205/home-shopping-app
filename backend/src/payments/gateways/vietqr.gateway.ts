import { PaymentMethod } from '@prisma/client';
import { AckKind, CreatePaymentInput, CreatePaymentResult, GatewayNotification, PaymentGateway } from './gateway.types';

export interface VietQrConfig {
  /** Mã BIN ngân hàng theo chuẩn Napas (vd. 970436 = Vietcombank) */
  bankBin: string;
  accountNo: string;
  accountName: string;
}

/**
 * Chuyển khoản ngân hàng qua mã VietQR (chuẩn Napas 247, ảnh QR từ img.vietqr.io).
 * Không có server cổng gọi về: cửa hàng đối soát sao kê theo NỘI DUNG chuyển khoản (= txnRef) rồi bấm
 * "Xác nhận đã nhận tiền" trong trang quản trị (POST /admin/payments/:id/confirm). Có thể nối thêm webhook
 * của dịch vụ đọc sao kê (SePay/Casso) sau này bằng cách cài verifyNotification.
 * Hoàn tiền: cửa hàng chuyển khoản lại thủ công (refund MANUAL_REQUIRED).
 */
export class VietQrGateway implements PaymentGateway {
  readonly method = PaymentMethod.VIETQR;
  readonly supportsRefund = false;
  readonly configured: boolean;

  constructor(private readonly cfg: VietQrConfig) {
    this.configured = Boolean(cfg.bankBin && cfg.accountNo && cfg.accountName);
  }

  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const content = input.txnRef;
    const imageUrl =
      `https://img.vietqr.io/image/${encodeURIComponent(this.cfg.bankBin)}-${encodeURIComponent(this.cfg.accountNo)}-compact2.png` +
      `?amount=${input.amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(this.cfg.accountName)}`;
    return {
      qr: { bankBin: this.cfg.bankBin, accountNo: this.cfg.accountNo, accountName: this.cfg.accountName, amount: input.amount, content, imageUrl },
    };
  }

  peekTxnRef(): string | null {
    return null;
  }

  verifyNotification(): GatewayNotification | null {
    return null;
  }

  ack(kind: AckKind): { status: number; body: unknown } {
    return { status: kind === 'invalid_signature' ? 400 : 200, body: { ok: kind === 'ok' || kind === 'duplicate' } };
  }
}
