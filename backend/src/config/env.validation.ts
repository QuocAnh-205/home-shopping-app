type Env = Record<string, string | undefined>;

const REQUIRED = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'] as const;
const DURATION_RE = /^\d+[smhd]$/;

export function validateEnv(config: Env): Env {
  const errors: string[] = [];

  const missing = REQUIRED.filter((key) => !config[key] || config[key]!.trim() === '');
  if (missing.length > 0) errors.push(`Missing required environment variables: ${missing.join(', ')}`);

  if ((config.JWT_SECRET ?? '').length < 32) errors.push('JWT_SECRET must be at least 32 characters long');

  if (config.JWT_EXPIRES_IN && !DURATION_RE.test(config.JWT_EXPIRES_IN)) {
    errors.push(`JWT_EXPIRES_IN must look like 15m, 12h, 1d (got "${config.JWT_EXPIRES_IN}")`);
  }

  const port = Number(config.PORT ?? 8080);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) errors.push(`PORT is invalid: ${config.PORT}`);

  if (config.DATABASE_URL && !/^postgres(ql)?:\/\//.test(config.DATABASE_URL)) {
    errors.push('DATABASE_URL must be a postgresql:// connection string');
  }
  if (config.REDIS_URL && !/^rediss?:\/\//.test(config.REDIS_URL)) errors.push('REDIS_URL must be a redis:// URL');

  if (config.APP_URL && !/^https?:\/\/[^/\s]+$/.test(config.APP_URL.replace(/\/+$/, ''))) {
    errors.push('APP_URL must be an origin like https://shop.example.com (no path)');
  }
  if (config.SMTP_URL && !/^smtps?:\/\//.test(config.SMTP_URL)) errors.push('SMTP_URL must start with smtp:// or smtps://');
  for (const [id, secret] of [
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET'],
  ] as const) {
    if (Boolean(config[id]) !== Boolean(config[secret])) errors.push(`${id} and ${secret} must be set together`);
  }
  // Cổng thanh toán: khóa bí mật chỉ đến từ biến môi trường; bộ khóa phải đầy đủ
  for (const group of [
    ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY'],
    ['VIETQR_BANK_BIN', 'VIETQR_ACCOUNT_NO', 'VIETQR_ACCOUNT_NAME'],
  ]) {
    const set = group.filter((k) => config[k]);
    if (set.length > 0 && set.length < group.length) errors.push(`${group.join(', ')} must be set together`);
  }
  if (config.VIETQR_BANK_BIN && !/^\d{6}$/.test(config.VIETQR_BANK_BIN)) errors.push('VIETQR_BANK_BIN must be a 6-digit Napas BIN (e.g. 970436)');
  for (const key of ['PAYMENT_HOLD_MINUTES', 'TRANSFER_CONFIRM_HOURS', 'ORDER_AUTO_COMPLETE_DAYS', 'RETURN_WINDOW_DAYS', 'SHIPPING_FREE_THRESHOLD', 'SHOP_PROVINCE_CODE']) {
    if (config[key] !== undefined && config[key] !== '' && !/^\d+$/.test(config[key]!)) errors.push(`${key} must be a non-negative integer`);
  }
  for (const key of ['PAYMENT_MOCK_ENABLED', 'TRANSFER_AUTO_CONFIRM']) {
    if (config[key] && !['true', 'false'].includes(config[key]!)) errors.push(`${key} must be true or false`);
  }
  for (const key of ['PAYMENT_IPN_BASE_URL', 'VNPAY_PAY_URL', 'VNPAY_API_URL', 'MOMO_ENDPOINT']) {
    if (config[key] && !/^https?:\/\/[^\s]+$/.test(config[key]!)) errors.push(`${key} must be an http(s) URL`);
  }

  // Cờ chỉ dành cho test e2e: cấm tuyệt đối ở production
  if (config.NODE_ENV === 'production' && config.THROTTLE_DISABLED === 'true') {
    errors.push('THROTTLE_DISABLED must not be enabled in production');
  }

  if (errors.length > 0) throw new Error(`Invalid environment configuration:\n - ${errors.join('\n - ')}`);
  return config;
}
