import { MockGateway } from './mock.gateway';
import { MomoGateway, hmacSha256, momoRaw } from './momo.gateway';
import { VnpayGateway, hmacSha512, stripVietnamese, vnpDate, vnpQuery } from './vnpay.gateway';

const input = {
  txnRef: 'HS2B0F8A1CDEADBEEF',
  amount: 470_000,
  orderId: '2b0f8a1c-3d4e-4f50-8a6b-7c8d9e0f1a2b',
  orderInfo: 'Thanh toán đơn hàng #2B0F8A1C',
  expiresAt: new Date('2026-11-11T05:15:00Z'),
  returnUrl: 'https://shop.example/payment/result?order=2b0f8a1c',
  ipnUrl: 'https://shop.example/api/payments/ipn/vnpay',
  clientIp: '1.2.3.4',
};

describe('VNPay gateway', () => {
  const cfg = { tmnCode: 'TESTCODE', hashSecret: 'SECRETSECRETSECRETSECRET', payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', apiUrl: 'https://x/api' };
  const gw = new VnpayGateway(cfg);

  /** Giả lập IPN đúng chuẩn VNPay: ký giống hệt cách server VNPay ký */
  const ipn = (overrides: Record<string, string> = {}) => {
    const params: Record<string, string> = {
      vnp_Amount: '47000000',
      vnp_BankCode: 'NCB',
      vnp_OrderInfo: 'Thanh toan don hang #2B0F8A1C',
      vnp_PayDate: '20261111120500',
      vnp_ResponseCode: '00',
      vnp_TmnCode: 'TESTCODE',
      vnp_TransactionNo: '14567890',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: input.txnRef,
      ...overrides,
    };
    return { ...params, vnp_SecureHashType: 'HmacSHA512', vnp_SecureHash: hmacSha512(cfg.hashSecret, vnpQuery(params)) };
  };

  it('formats dates in GMT+7 and strips Vietnamese accents', () => {
    expect(vnpDate(new Date('2026-11-11T05:15:00Z'))).toBe('20261111121500');
    expect(stripVietnamese('Thanh toán đơn hàng Đà Nẵng #1')).toBe('Thanh toan don hang Da Nang #1');
  });

  it('builds a signed payment URL: sorted params, amount ×100, spaces as "+"', async () => {
    const { payUrl, raw } = await gw.create(input);
    const url = new URL(payUrl!);
    const q = Object.fromEntries(url.searchParams);
    expect(q).toMatchObject({ vnp_Amount: '47000000', vnp_TxnRef: input.txnRef, vnp_TmnCode: 'TESTCODE', vnp_ExpireDate: '20261111121500', vnp_OrderInfo: 'Thanh toan don hang #2B0F8A1C' });
    expect(url.search).toContain('vnp_OrderInfo=Thanh+toan+don+hang');
    const { vnp_SecureHash, ...rest } = q;
    expect(vnp_SecureHash).toBe(hmacSha512(cfg.hashSecret, vnpQuery(rest)));
    expect(raw).toMatchObject({ vnp_CreateDate: expect.stringMatching(/^\d{14}$/) });
  });

  it('accepts a correctly signed IPN and reads amount / result', () => {
    expect(gw.verifyNotification(ipn())).toMatchObject({ txnRef: input.txnRef, amount: 470_000, success: true, gatewayTxnId: '14567890' });
    expect(gw.verifyNotification(ipn({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }))?.success).toBe(false);
  });

  it('rejects tampered, foreign-merchant or unsigned IPNs', () => {
    expect(gw.verifyNotification({ ...ipn(), vnp_Amount: '100' })).toBeNull();
    expect(gw.verifyNotification(ipn({ vnp_TmnCode: 'OTHER' }))).toBeNull();
    const { vnp_SecureHash: _h, ...unsigned } = ipn();
    expect(gw.verifyNotification(unsigned)).toBeNull();
  });

  it('answers VNPay with the documented RspCode values', () => {
    expect(gw.ack('ok').body).toEqual({ RspCode: '00', Message: 'Confirm Success' });
    expect(gw.ack('duplicate').body).toMatchObject({ RspCode: '02' });
    expect(gw.ack('invalid_amount').body).toMatchObject({ RspCode: '04' });
    expect(gw.ack('invalid_signature').body).toMatchObject({ RspCode: '97' });
  });

  it('signs refund requests with the pipe-joined field order', async () => {
    const http = jest.fn(async () => ({ status: 200, json: async () => ({ vnp_ResponseCode: '00', vnp_TransactionNo: '999' }) }));
    const g = new VnpayGateway(cfg, http as unknown as typeof fetch);
    const res = await g.refund({ txnRef: input.txnRef, gatewayTxnId: '14567890', amount: 470_000, paymentCreatedAt: new Date(), rawCreate: { vnp_CreateDate: '20261111120000' }, reason: 'Hủy đơn', clientIp: '1.2.3.4' });
    expect(res).toMatchObject({ ok: true, gatewayRefundId: '999' });
    const body = JSON.parse((http.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    const order = ['vnp_RequestId', 'vnp_Version', 'vnp_Command', 'vnp_TmnCode', 'vnp_TransactionType', 'vnp_TxnRef', 'vnp_Amount', 'vnp_TransactionNo', 'vnp_TransactionDate', 'vnp_CreateBy', 'vnp_CreateDate', 'vnp_IpAddr', 'vnp_OrderInfo'];
    expect(body.vnp_SecureHash).toBe(hmacSha512(cfg.hashSecret, order.map((k) => body[k]).join('|')));
    expect(body).toMatchObject({ vnp_Command: 'refund', vnp_Amount: '47000000', vnp_TransactionDate: '20261111120000' });
  });
});

describe('MoMo gateway', () => {
  const cfg = { partnerCode: 'MOMOTEST', accessKey: 'ACCESSKEY', secretKey: 'SECRETKEY', endpoint: 'https://test-payment.momo.vn' };

  const ipn = (overrides: Record<string, string | number> = {}) => {
    const p: Record<string, string | number> = {
      partnerCode: 'MOMOTEST',
      orderId: input.txnRef,
      requestId: 'req-1',
      amount: 470_000,
      orderInfo: input.orderInfo,
      orderType: 'momo_wallet',
      transId: 4088878653,
      resultCode: 0,
      message: 'Thành công.',
      payType: 'qr',
      responseTime: 1762841100000,
      extraData: '',
      ...overrides,
    };
    const keys = ['accessKey', 'amount', 'extraData', 'message', 'orderId', 'orderInfo', 'orderType', 'partnerCode', 'payType', 'requestId', 'responseTime', 'resultCode', 'transId'];
    return { ...p, signature: hmacSha256(cfg.secretKey, momoRaw({ ...p, accessKey: cfg.accessKey }, keys)) };
  };

  it('creates a payment with the documented signature string and never sends the access key in clear', async () => {
    const http = jest.fn(async () => ({ status: 200, json: async () => ({ resultCode: 0, payUrl: 'https://test-payment.momo.vn/pay/xyz' }) }));
    const gw = new MomoGateway(cfg, http as unknown as typeof fetch);
    const res = await gw.create({ ...input, ipnUrl: 'https://shop.example/api/payments/ipn/momo' });
    expect(res.payUrl).toBe('https://test-payment.momo.vn/pay/xyz');
    const [url, init] = http.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://test-payment.momo.vn/v2/gateway/api/create');
    const body = JSON.parse(init.body);
    expect(body.accessKey).toBeUndefined();
    const raw = `accessKey=ACCESSKEY&amount=470000&extraData=&ipnUrl=https://shop.example/api/payments/ipn/momo&orderId=${input.txnRef}&orderInfo=${input.orderInfo}&partnerCode=MOMOTEST&redirectUrl=${input.returnUrl}&requestId=${body.requestId}&requestType=captureWallet`;
    expect(body.signature).toBe(hmacSha256(cfg.secretKey, raw));
  });

  it('verifies IPN signatures and rejects tampering', () => {
    const gw = new MomoGateway(cfg);
    expect(gw.verifyNotification(ipn())).toMatchObject({ txnRef: input.txnRef, amount: 470_000, success: true, gatewayTxnId: '4088878653' });
    expect(gw.verifyNotification(ipn({ resultCode: 1006 }))?.success).toBe(false);
    expect(gw.verifyNotification({ ...ipn(), amount: 1000 })).toBeNull();
    expect(gw.verifyNotification(ipn({ partnerCode: 'OTHER' }))).toBeNull();
    expect(gw.ack('ok')).toEqual({ status: 204, body: undefined });
  });

  it('throws when MoMo refuses to create the payment', async () => {
    const http = jest.fn(async () => ({ status: 200, json: async () => ({ resultCode: 13, message: 'Merchant authentication failed' }) }));
    await expect(new MomoGateway(cfg, http as unknown as typeof fetch).create(input)).rejects.toThrow('MoMo create 13');
  });
});

describe('mock gateway (sandbox giả lập)', () => {
  const gw = new MockGateway('VNPAY', 'mock-secret', 'https://shop.example');

  it('issues a signed link and only accepts results for that exact link', async () => {
    const { payUrl } = await gw.create(input);
    const q = new URL(payUrl!).searchParams;
    const sig = q.get('sig')!;
    expect(gw.verifyNotification({ txnRef: input.txnRef, amount: 470_000, result: 'success', sig })).toMatchObject({ success: true, amount: 470_000 });
    expect(gw.verifyNotification({ txnRef: input.txnRef, amount: 1_000, result: 'success', sig })).toBeNull();
    expect(gw.verifyNotification({ txnRef: 'OTHER', amount: 470_000, result: 'success', sig })).toBeNull();
    expect(new MockGateway('MOMO', 'mock-secret', 'x').verifyNotification({ txnRef: input.txnRef, amount: 470_000, result: 'success', sig })).toBeNull();
  });
});
