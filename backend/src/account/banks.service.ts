import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BankAccount, Prisma } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { BANK_NAMES } from '../payments/gateways/vietqr.gateway';

export const MAX_BANK_ACCOUNTS = 5;

/** Danh mục ngân hàng cho ô chọn (BIN Napas → tên) */
export const BANK_CATALOG = Object.entries(BANK_NAMES)
  .map(([bin, name]) => ({ bin, name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

export type BankAccountView = Omit<BankAccount, 'userId'> & { accountNoMasked: string };

/** "0123456789" → "******6789" (hiển thị trong danh sách, giống app ngân hàng) */
export function maskAccountNo(no: string): string {
  return no.length <= 4 ? no : `${'*'.repeat(no.length - 4)}${no.slice(-4)}`;
}

/** Tài khoản ngân hàng của khách: nhận tiền hoàn khi đơn chuyển khoản / COD được duyệt trả hàng */
@Injectable()
export class BanksService {
  private readonly logger = new Logger(BanksService.name);

  constructor(private readonly prisma: PrismaService) {}

  private static view(b: BankAccount): BankAccountView {
    const { userId: _u, ...rest } = b;
    return { ...rest, accountNoMasked: maskAccountNo(b.accountNo) };
  }

  async list(userId: string): Promise<BankAccountView[]> {
    const rows = await this.prisma.bankAccount.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
    return rows.map(BanksService.view);
  }

  async add(userId: string, dto: { bankBin: string; accountNo: string; holderName: string; isDefault?: boolean }): Promise<BankAccountView[]> {
    const bank = BANK_CATALOG.find((b) => b.bin === dto.bankBin);
    if (!bank) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Ngân hàng không hợp lệ');
    try {
      await this.prisma.$transaction(async (tx) => {
        // Khóa dòng user → 2 request song song không vượt giới hạn / không tạo 2 tài khoản mặc định
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const count = await tx.bankAccount.count({ where: { userId } });
        if (count >= MAX_BANK_ACCOUNTS) throw new AppError(ErrorCode.BAD_REQUEST, `Bạn chỉ lưu được tối đa ${MAX_BANK_ACCOUNTS} tài khoản ngân hàng`);
        const isDefault = count === 0 || Boolean(dto.isDefault);
        if (isDefault) await tx.bankAccount.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
        await tx.bankAccount.create({ data: { userId, bankBin: bank.bin, bankName: bank.name, accountNo: dto.accountNo, holderName: dto.holderName, isDefault } });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(ErrorCode.CONFLICT, 'Tài khoản ngân hàng này đã được thêm', HttpStatus.CONFLICT);
      }
      throw err;
    }
    this.logger.log({ event: 'account.bank_added', userId, bankBin: bank.bin });
    return this.list(userId);
  }

  async setDefault(userId: string, id: string): Promise<BankAccountView[]> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const target = await tx.bankAccount.findFirst({ where: { id, userId }, select: { id: true } });
      if (!target) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tài khoản ngân hàng', HttpStatus.NOT_FOUND);
      await tx.bankAccount.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      await tx.bankAccount.update({ where: { id }, data: { isDefault: true } });
    });
    return this.list(userId);
  }

  async remove(userId: string, id: string): Promise<BankAccountView[]> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const target = await tx.bankAccount.findFirst({ where: { id, userId }, select: { isDefault: true } });
      if (!target) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tài khoản ngân hàng', HttpStatus.NOT_FOUND);
      await tx.bankAccount.delete({ where: { id } });
      if (target.isDefault) {
        const next = await tx.bankAccount.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
        if (next) await tx.bankAccount.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return this.list(userId);
  }
}
