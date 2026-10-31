import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { UpdateProfileDto } from '../auth/auth.dto';
import { AuthService } from '../auth/auth.service';
import { AccountProfile } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AddressDto } from './account.dto';

export const MAX_ADDRESSES = 10;
const MIN_AGE_YEARS = 10;

export type AddressView = Omit<Address, 'userId'>;

const addressSelect = {
  id: true,
  fullName: true,
  phone: true,
  province: true,
  district: true,
  ward: true,
  street: true,
  type: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AddressSelect;

/** Hồ sơ cá nhân + sổ địa chỉ của chính người dùng đang đăng nhập (mọi truy vấn đều lọc theo userId) */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<AccountProfile> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = dto.dateOfBirth === null ? null : AccountService.parseBirthDate(dto.dateOfBirth);
    await this.prisma.user.update({ where: { id: userId }, data });
    this.logger.log({ event: 'account.profile_updated', userId, fields: Object.keys(data) });
    return this.auth.profile(userId);
  }

  /** Ngày sinh hợp lệ: từ 1900-01-01 và người dùng ít nhất 10 tuổi */
  static parseBirthDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid date of birth');
    const latest = new Date();
    latest.setUTCFullYear(latest.getUTCFullYear() - MIN_AGE_YEARS);
    if (date < new Date('1900-01-01T00:00:00.000Z') || date > latest) throw new BadRequestException('Invalid date of birth');
    return date;
  }

  async setAvatar(userId: string, file: Buffer, mime: string): Promise<AccountProfile> {
    const avatarUrl = await this.storage.uploadAvatar(userId, file, mime);
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    return this.auth.profile(userId);
  }

  listAddresses(userId: string): Promise<AddressView[]> {
    return this.prisma.address.findMany({
      where: { userId },
      select: addressSelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(userId: string, dto: AddressDto): Promise<AddressView> {
    return this.prisma.$transaction(async (tx) => {
      // Khóa dòng user → 2 request tạo địa chỉ song song không vượt quá giới hạn / không tạo 2 địa chỉ mặc định
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const count = await tx.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) throw new BadRequestException(`You can save at most ${MAX_ADDRESSES} addresses`);
      // Địa chỉ đầu tiên luôn là mặc định
      const isDefault = count === 0 || Boolean(dto.isDefault);
      if (isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      return tx.address.create({ data: { ...dto, isDefault, userId }, select: addressSelect });
    });
  }

  async updateAddress(userId: string, id: string, dto: AddressDto): Promise<AddressView> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const current = await tx.address.findFirst({ where: { id, userId }, select: { isDefault: true } });
      if (!current) throw new NotFoundException('Address not found');
      // Không cho bỏ cờ mặc định trực tiếp: phải chọn địa chỉ khác làm mặc định
      const isDefault = current.isDefault || Boolean(dto.isDefault);
      if (isDefault && !current.isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: { ...dto, isDefault }, select: addressSelect });
    });
  }

  async setDefaultAddress(userId: string, id: string): Promise<AddressView[]> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const target = await tx.address.findFirst({ where: { id, userId }, select: { id: true } });
      if (!target) throw new NotFoundException('Address not found');
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      await tx.address.update({ where: { id }, data: { isDefault: true } });
    });
    return this.listAddresses(userId);
  }

  async deleteAddress(userId: string, id: string): Promise<AddressView[]> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const target = await tx.address.findFirst({ where: { id, userId }, select: { isDefault: true } });
      if (!target) throw new NotFoundException('Address not found');
      await tx.address.delete({ where: { id } });
      // Xóa địa chỉ mặc định → địa chỉ mới nhất còn lại trở thành mặc định
      if (target.isDefault) {
        const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return this.listAddresses(userId);
  }
}
