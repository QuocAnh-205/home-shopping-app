import { Prisma } from '@prisma/client';

/** Cài đặt tài khoản (cột users.settings JSON) – mọi khóa đều có mặc định, dữ liệu cũ thiếu khóa vẫn đọc được */
export interface UserSettings {
  /** Email khi đơn hàng đổi trạng thái / thanh toán / hoàn tiền */
  emailOrderUpdates: boolean;
  /** Email voucher sắp hết hạn, ưu đãi */
  emailPromotions: boolean;
  /** Thông báo trong web về voucher, ưu đãi */
  inAppPromotions: boolean;
  /** Ẩn họ tên & ảnh đại diện khi hiển thị đánh giá ("N***h") */
  hideNameInReviews: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  emailOrderUpdates: true,
  emailPromotions: false,
  inAppPromotions: true,
  hideNameInReviews: false,
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof UserSettings)[];

export function readSettings(raw: Prisma.JsonValue | null | undefined): UserSettings {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SETTINGS };
  for (const k of SETTING_KEYS) if (typeof obj[k] === 'boolean') out[k] = obj[k] as boolean;
  return out;
}

/** "Nguyễn Văn An" → "N***n" (giống cách các sàn ẩn tên người đánh giá) */
export function maskName(fullName: string): string {
  const s = fullName.trim();
  if (s.length <= 1) return '*';
  return `${s[0]}***${s[s.length - 1]}`;
}

export const USERNAME_RE = /^[a-z0-9._]{4,30}$/;

/** Tên đăng nhập gợi ý từ email: phần trước @ chỉ giữ a-z 0-9 . _ + hậu tố ngẫu nhiên tránh trùng */
export function usernameFromEmail(email: string, suffix: string): string {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24) || 'user';
  return `${base}${suffix}`.slice(0, 30);
}
