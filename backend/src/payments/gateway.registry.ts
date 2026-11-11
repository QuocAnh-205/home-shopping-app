import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { PaymentGateway } from './gateways/gateway.types';
import { MockGateway } from './gateways/mock.gateway';
import { MomoGateway } from './gateways/momo.gateway';
import { VietQrGateway } from './gateways/vietqr.gateway';
import { VnpayGateway } from './gateways/vnpay.gateway';

type OnlineMethod = Exclude<PaymentMethod, 'COD'>;

/**
 * Chọn cổng cho từng phương thức từ biến môi trường (khóa bí mật KHÔNG nằm trong repo):
 * - Có khóa thật → cổng thật (sandbox hay production tùy URL cấu hình)
 * - Không có khóa + PAYMENT_MOCK_ENABLED=true → cổng giả lập để demo
 * - Không có gì → phương thức hiện "chưa hỗ trợ" ở trang thanh toán
 */
@Injectable()
export class PaymentGatewayRegistry {
  private readonly logger = new Logger(PaymentGatewayRegistry.name);
  private readonly real: Record<OnlineMethod, PaymentGateway>;
  private readonly mocks: Partial<Record<OnlineMethod, MockGateway>> = {};
  readonly mockEnabled: boolean;
  readonly appUrl: string;
  readonly apiBaseUrl: string;

  constructor(config: ConfigService) {
    const get = (k: string) => config.get<string>(k) ?? '';
    this.appUrl = (get('APP_URL') || 'http://localhost').replace(/\/+$/, '');
    // IPN phải là URL công khai mà server cổng gọi tới được (localhost thì cổng thật không gọi về được)
    this.apiBaseUrl = (get('PAYMENT_IPN_BASE_URL') || this.appUrl).replace(/\/+$/, '');
    this.mockEnabled = (get('PAYMENT_MOCK_ENABLED') || (get('NODE_ENV') === 'production' ? 'false' : 'true')) === 'true';

    this.real = {
      VNPAY: new VnpayGateway({
        tmnCode: get('VNPAY_TMN_CODE'),
        hashSecret: get('VNPAY_HASH_SECRET'),
        payUrl: get('VNPAY_PAY_URL') || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
        apiUrl: get('VNPAY_API_URL') || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      }),
      MOMO: new MomoGateway({
        partnerCode: get('MOMO_PARTNER_CODE'),
        accessKey: get('MOMO_ACCESS_KEY'),
        secretKey: get('MOMO_SECRET_KEY'),
        endpoint: (get('MOMO_ENDPOINT') || 'https://test-payment.momo.vn').replace(/\/+$/, ''),
      }),
      VIETQR: new VietQrGateway({ bankBin: get('VIETQR_BANK_BIN'), accountNo: get('VIETQR_ACCOUNT_NO'), accountName: get('VIETQR_ACCOUNT_NAME') }),
    };
    if (this.mockEnabled) {
      // Khóa ký link giả lập suy ra từ JWT_SECRET (không cần thêm biến môi trường, không lộ JWT_SECRET)
      const secret = createHmac('sha256', get('JWT_SECRET')).update('payment-mock-v1').digest('hex');
      for (const m of [PaymentMethod.VNPAY, PaymentMethod.MOMO] as const) {
        if (!this.real[m].configured) this.mocks[m] = new MockGateway(m, secret, this.appUrl);
      }
    }
    this.logger.log({
      event: 'payment.gateways',
      vnpay: this.mode('VNPAY'),
      momo: this.mode('MOMO'),
      vietqr: this.mode('VIETQR'),
    });
  }

  private mode(m: OnlineMethod): string {
    return this.real[m].configured ? 'live' : this.mocks[m] ? 'mock' : 'off';
  }

  /** Cổng dùng để TẠO giao dịch mới cho phương thức */
  get(method: OnlineMethod): PaymentGateway {
    return this.real[method].configured ? this.real[method] : (this.mocks[method] ?? this.real[method]);
  }

  /** Cổng giả lập (chỉ khi đang bật) – dùng cho endpoint /payments/mock/notify */
  mock(method: OnlineMethod): MockGateway | undefined {
    return this.mocks[method];
  }

  /** Cổng đã tạo 1 giao dịch cụ thể (giao dịch tạo bằng giả lập thì hoàn tiền cũng bằng giả lập) */
  forPayment(payment: { method: PaymentMethod; rawCreate: unknown }): PaymentGateway | undefined {
    if (payment.method === PaymentMethod.COD) return undefined;
    const isMock = Boolean((payment.rawCreate as { mock?: boolean } | null)?.mock);
    return isMock ? this.mocks[payment.method] : this.real[payment.method];
  }

  returnUrl(orderId: string): string {
    return `${this.appUrl}/payment/result?order=${orderId}`;
  }

  ipnUrl(method: OnlineMethod): string {
    return `${this.apiBaseUrl}/api/payments/ipn/${method.toLowerCase()}`;
  }
}
