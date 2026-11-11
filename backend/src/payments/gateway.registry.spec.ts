import { ConfigService } from '@nestjs/config';
import { PaymentGatewayRegistry } from './gateway.registry';

const registry = (env: Record<string, string>) =>
  new PaymentGatewayRegistry({ get: (k: string) => ({ JWT_SECRET: 'x'.repeat(32), APP_URL: 'https://shop.example', ...env })[k] } as unknown as ConfigService);

const MB = { VIETQR_BANK_BIN: '970422', VIETQR_ACCOUNT_NO: '0123456789', VIETQR_ACCOUNT_NAME: 'NGUYEN VAN A' };
const input = {
  txnRef: 'HSABCDEF1234567890',
  amount: 362_000,
  orderId: 'o1',
  orderInfo: 'x',
  expiresAt: new Date(Date.now() + 900_000),
  returnUrl: 'r',
  ipnUrl: 'i',
  clientIp: '1.1.1.1',
};

describe('PaymentGatewayRegistry', () => {
  it('without merchant keys, VNPay and MoMo pay into the shop VietQR account (any bank / MoMo app can scan it)', async () => {
    const r = registry({ ...MB, PAYMENT_MOCK_ENABLED: 'true' });
    for (const m of ['VNPAY', 'MOMO', 'VIETQR'] as const) {
      const gw = r.get(m);
      expect(gw).toMatchObject({ method: m, configured: true, transfer: true, supportsRefund: false });
      expect(gw.mock).toBeUndefined();
    }
    const res = await r.get('MOMO').create(input);
    expect(res.qr).toMatchObject({ bankBin: '970422', bankName: 'MB Bank (Ngân hàng Quân Đội)', accountNo: '0123456789', amount: 362_000, content: input.txnRef });
    expect(res.qr!.imageUrl).toBe(
      'https://img.vietqr.io/image/970422-0123456789-compact2.png?amount=362000&addInfo=HSABCDEF1234567890&accountName=NGUYEN%20VAN%20A',
    );
    expect(res.raw).toEqual({ transfer: true });
    // Giao dịch tạo bằng mã QR → hoàn tiền tay (không gọi API cổng)
    expect(r.forPayment({ method: 'MOMO', rawCreate: { transfer: true } })?.supportsRefund).toBe(false);
  });

  it('real merchant keys take priority over the QR fallback', () => {
    const r = registry({ ...MB, VNPAY_TMN_CODE: 'TMN', VNPAY_HASH_SECRET: 'SECRET' });
    expect(r.get('VNPAY').transfer).toBeUndefined();
    expect(r.get('VNPAY').configured).toBe(true);
    expect(r.get('MOMO').transfer).toBe(true);
  });

  it('falls back to the mock gateway only when no bank account is configured', () => {
    expect(registry({ PAYMENT_MOCK_ENABLED: 'true' }).get('VNPAY').mock).toBe(true);
    expect(registry({ PAYMENT_MOCK_ENABLED: 'false' }).get('VNPAY').configured).toBe(false);
    expect(registry({ PAYMENT_MOCK_ENABLED: 'true' }).get('VIETQR').configured).toBe(false);
  });
});
