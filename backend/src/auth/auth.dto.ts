import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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
