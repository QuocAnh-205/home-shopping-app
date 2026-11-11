import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://u:p@postgres:5432/db',
    REDIS_URL: 'redis://:p@redis:6379/0',
    JWT_SECRET: 'x'.repeat(32),
  };

  it('accepts a valid configuration', () => {
    expect(validateEnv(valid)).toBe(valid);
  });

  it('reports every problem at once', () => {
    expect(() => validateEnv({ JWT_SECRET: 'short', PORT: '99999' })).toThrow(
      /Missing required.*DATABASE_URL, REDIS_URL[\s\S]*JWT_SECRET must be[\s\S]*PORT is invalid/,
    );
  });

  it('rejects malformed JWT_EXPIRES_IN', () => {
    expect(() => validateEnv({ ...valid, JWT_EXPIRES_IN: 'one day' })).toThrow(/JWT_EXPIRES_IN/);
  });

  it('requires complete payment gateway credentials and sane numbers', () => {
    expect(() => validateEnv({ ...valid, VNPAY_TMN_CODE: 'ABC' })).toThrow(/VNPAY_TMN_CODE and VNPAY_HASH_SECRET/);
    expect(() => validateEnv({ ...valid, MOMO_PARTNER_CODE: 'M', MOMO_ACCESS_KEY: 'A' })).toThrow(/MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY/);
    expect(() => validateEnv({ ...valid, VIETQR_BANK_BIN: '97', VIETQR_ACCOUNT_NO: '1', VIETQR_ACCOUNT_NAME: 'X' })).toThrow(/6-digit/);
    expect(() => validateEnv({ ...valid, PAYMENT_HOLD_MINUTES: '15m' })).toThrow(/PAYMENT_HOLD_MINUTES/);
    expect(() => validateEnv({ ...valid, PAYMENT_MOCK_ENABLED: 'yes' })).toThrow(/PAYMENT_MOCK_ENABLED/);
    expect(validateEnv({ ...valid, VNPAY_TMN_CODE: 'ABC', VNPAY_HASH_SECRET: 'S', SHIPPING_FREE_THRESHOLD: '0' })).toBeTruthy();
  });

  it('forbids disabling throttling in production', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production', THROTTLE_DISABLED: 'true' })).toThrow(/THROTTLE_DISABLED/);
  });
});
