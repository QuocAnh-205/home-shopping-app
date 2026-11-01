import { AddressType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
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

  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(100)
  @Matches(NO_HTML)
  province: string;

  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(100)
  @Matches(NO_HTML)
  district: string;

  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(100)
  @Matches(NO_HTML)
  ward: string;

  @IsString()
  @Transform(trim)
  @MinLength(3)
  @MaxLength(255)
  @Matches(NO_HTML, { message: 'street must not contain HTML' })
  street: string;

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
