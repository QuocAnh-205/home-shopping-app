import { PaymentMethod } from '@prisma/client';
import { AckKind, CreatePaymentInput, CreatePaymentResult, GatewayNotification, PaymentGateway } from './gateway.types';

export interface VietQrConfig {
  /** Mã BIN ngân hàng theo chuẩn Napas (vd. 970422 = MB Bank) */
  bankBin: string;
  accountNo: string;
  accountName: string;
}

/** Tên ngân hàng theo BIN Napas (hiển thị cho khách); BIN khác → hiện "Ngân hàng (BIN xxx)" */
export const BANK_NAMES: Readonly<Record<string, string>> = {
  '970422': 'MB Bank (Ngân hàng Quân Đội)',
  '970436': 'Vietcombank',
  '970415': 'VietinBank',
  '970418': 'BIDV',
  '970405': 'Agribank',
  '970407': 'Techcombank',
  '970416': 'ACB',
  '970432': 'VPBank',
  '970423': 'TPBank',
  '970403': 'Sacombank',
  '970437': 'HDBank',
  '970441': 'VIB',
  '970443': 'SHB',
  '970448': 'OCB',
  '970426': 'MSB',
};

export function bankName(bin: string): string {
  return BANK_NAMES[bin] ?? `Ngân hàng (BIN ${bin})`;
}

/**
 * Chuyển khoản qua mã VietQR (chuẩn Napas 247): quét được bằng app của MỌI ngân hàng Việt Nam,
 * ví MoMo, ZaloPay, ShopeePay và các app có VNPay-QR → tiền vào thẳng tài khoản cửa hàng.
 *
 * Dùng cho 3 phương thức:
 * - VIETQR: "Chuyển khoản ngân hàng"
 * - VNPAY / MOMO khi CHƯA có tài khoản merchant của cổng: khách quét đúng mã này bằng app MoMo / app ngân hàng
 *   (method của gateway = VNPAY / MOMO để lưu đúng lựa chọn của khách, hướng dẫn hiển thị theo app)
 *
 * Không có server cổng gọi về: khách bấm "Tôi đã chuyển khoản" (đơn được giữ thêm), cửa hàng đối soát sao kê theo
 * NỘI DUNG chuyển khoản (= txnRef) rồi bấm "Xác nhận đã nhận tiền". Hoàn tiền: chuyển khoản lại thủ công.
 */
export class VietQrGateway implements PaymentGateway {
  readonly supportsRefund = false;
  readonly transfer = true;
  readonly configured: boolean;

  constructor(
    private readonly cfg: VietQrConfig,
    readonly method: PaymentMethod = PaymentMethod.VIETQR,
  ) {
    this.configured = Boolean(cfg.bankBin && cfg.accountNo && cfg.accountName);
  }

  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const content = input.txnRef;
    const imageUrl =
      `https://img.vietqr.io/image/${encodeURIComponent(this.cfg.bankBin)}-${encodeURIComponent(this.cfg.accountNo)}-compact2.png` +
      `?amount=${input.amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(this.cfg.accountName)}`;
    return {
      qr: {
        bankBin: this.cfg.bankBin,
        bankName: bankName(this.cfg.bankBin),
        accountNo: this.cfg.accountNo,
        accountName: this.cfg.accountName,
        amount: input.amount,
        content,
        imageUrl,
      },
      raw: { transfer: true },
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
