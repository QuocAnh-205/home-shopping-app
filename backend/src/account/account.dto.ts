import { AddressType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { VN_PHONE_RE } from '../auth/auth.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);
const NO_HTML = /^[^<>]*$/;

export class AddressDto {
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(100)
  @Matches(NO_HTML, { message: 'fullName must not contain HTML' })
  fullName: string;

  @IsString()
  @Transform(trim)
  @Matches(VN_PHONE_RE, { message: 'phone must be a valid Vietnamese phone number' })
  phone: string;

  /** Mã tỉnh/thành (GET /api/locations/provinces) – đơn vị hành chính 2 cấp từ 01/07/2025 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  provinceCode: number;

  /** Mã xã/phường (GET /api/locations/provinces/:code/wards); server kiểm tra xã thuộc đúng tỉnh */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardCode: number;

  @IsString()
  @Transform(trim)
  @MinLength(3)
  @MaxLength(255)
  @Matches(NO_HTML, { message: 'street must not contain HTML' })
  street: string;

  /** Vị trí ghim trên bản đồ (tùy chọn) – phải nằm trong lãnh thổ Việt Nam */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(7)
  @Max(24)
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(101)
  @Max(118)
  longitude?: number | null;

  @IsOptional()
  @IsEnum(AddressType)
  type?: AddressType;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** Xóa tài khoản: gõ lại đúng email; tài khoản có mật khẩu phải nhập mật khẩu hiện tại */
export class DeleteAccountDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  confirmEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(72)
  password?: string;
}

export class ChangeUsernameDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9._]{4,30}$/, { message: 'Tên đăng nhập gồm 4–30 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới' })
  username: string;
}

export class EmailChangeRequestDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  newEmail: string;

  /** Bắt buộc với tài khoản có mật khẩu */
  @IsOptional()
  @IsString()
  @MaxLength(72)
  password?: string;
}

export class EmailChangeConfirmDto {
  @Matches(/^\d{6}$/, { message: 'Mã xác nhận gồm 6 chữ số' })
  code: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  emailOrderUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  emailPromotions?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppPromotions?: boolean;

  @IsOptional()
  @IsBoolean()
  hideNameInReviews?: boolean;
}

export class BankAccountDto {
  @Matches(/^\d{6}$/, { message: 'Vui lòng chọn ngân hàng' })
  bankBin: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value))
  @Matches(/^\d{6,19}$/, { message: 'Số tài khoản gồm 6–19 chữ số' })
  accountNo: string;

  /** Tên chủ tài khoản: IN HOA không dấu như trên thẻ */
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D')
          .toUpperCase()
          .trim()
          .replace(/\s+/g, ' ')
      : value,
  )
  @Matches(/^[A-Z ]{3,100}$/, { message: 'Tên chủ tài khoản chỉ gồm chữ cái (IN HOA không dấu)' })
  holderName: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
