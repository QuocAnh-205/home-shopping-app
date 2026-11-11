import { Gender } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Chính sách mật khẩu dùng chung cho đăng ký / đặt lại / đổi mật khẩu */
function StrongPassword(): PropertyDecorator {
  return (target, key) => {
    IsString()(target, key);
    MinLength(8)(target, key);
    // bcrypt chỉ dùng 72 byte đầu → chặn mật khẩu dài hơn để tránh hiểu nhầm
    MaxLength(72)(target, key);
    Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: 'password must contain uppercase, lowercase and a number' })(target, key);
  };
}

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(normalizeEmail)
  email: string;

  @StrongPassword()
  password: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[^<>]*$/, { message: 'fullName must not contain HTML' })
  fullName: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(normalizeEmail)
  email: string;

  @IsString()
  @MaxLength(72)
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(normalizeEmail)
  email: string;
}

export class ResetPasswordDto {
  /** Token base64url 32 byte gửi qua email */
  @Matches(/^[A-Za-z0-9_-]{40,64}$/, { message: 'token is invalid' })
  token: string;

  @StrongPassword()
  password: string;
}

export class ChangePasswordDto {
  /** Bỏ trống khi tài khoản đăng nhập bằng Google/Facebook chưa từng đặt mật khẩu */
  @IsOptional()
  @IsString()
  @MaxLength(72)
  currentPassword?: string;

  @StrongPassword()
  newPassword: string;
}

export class OAuthExchangeDto {
  @Matches(/^[A-Za-z0-9_-]{32,64}$/, { message: 'code is invalid' })
  code: string;
}

/** ID token (JWT) Google trả về cho Google One Tap: 3 phần base64url ngăn bởi dấu chấm */
export class GoogleOneTapDto {
  @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, { message: 'credential is invalid' })
  @MaxLength(4096)
  credential: string;
}

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' ? null : v;
};

/** Số điện thoại Việt Nam: 10–11 chữ số, bắt đầu bằng 0 (khớp CHECK constraint trong DB) */
export const VN_PHONE_RE = /^0\d{9,10}$/;

/** Cập nhật hồ sơ: trường không gửi = giữ nguyên; gửi null/chuỗi rỗng = xóa (trừ họ tên) */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[^<>]*$/, { message: 'fullName must not contain HTML' })
  fullName?: string;

  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @Matches(VN_PHONE_RE, { message: 'phone must be a valid Vietnamese phone number' })
  phone?: string | null;

  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsEnum(Gender)
  gender?: Gender | null;

  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string | null;
}
