/**
 * Tiền tệ: mọi số tiền là số nguyên VND (Int trong PostgreSQL, number trong JSON).
 * VND không có đơn vị lẻ nên không cần Decimal; số nguyên an toàn của JS (2^53) dư cho mọi đơn hàng.
 */

/** class-transformer: nhận 199000 | "199000" | "199000.00" → 199000; giá trị khác giữ nguyên để validator báo lỗi */
export function toVnd({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined || value === '') return value === '' ? undefined : value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d{1,13}(\.0{1,2})?$/.test(value.trim())) return Number.parseInt(value, 10);
  return value;
}

/** Chia theo % và làm tròn xuống (giảm giá không bao giờ vượt số tiền thực) */
export function percentOf(amount: number, percent: number): number {
  return Math.floor((amount * percent) / 100);
}
