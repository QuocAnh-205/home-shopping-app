import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OrderStatus, Prisma, Voucher, VoucherType } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { describeVoucher } from './voucher-engine';
import { CreateVoucherDto, UpdateVoucherDto } from './vouchers.dto';

export type VoucherView = Omit<Voucher, 'usedCount' | 'usageLimit' | 'createdAt' | 'updatedAt'> & {
  summary: string;
  /** Còn bao nhiêu % lượt (thanh tiến độ "Đã dùng 80%" như Shopee); null = không giới hạn */
  usedPercent: number | null;
  saved?: boolean;
};

export interface AppliedVoucher {
  voucher: Pick<Voucher, 'id' | 'code' | 'perUserLimit' | 'type'>;
  discount: number;
}

@Injectable()
export class VouchersService implements OnModuleInit {
  private readonly logger = new Logger(VouchersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  /** Hủy đơn → trả lại lượt voucher trong cùng transaction với bước hủy (Shopee hoàn voucher khi hủy đơn) */
  onModuleInit(): void {
    this.lifecycle.register({
      name: 'vouchers.release',
      inTx: async (tx, event) => {
        if (event.to === OrderStatus.CANCELLED) await this.release(tx, event.orderId);
      },
    });
  }

  static toView(v: Voucher, saved?: boolean): VoucherView {
    const { usedCount, usageLimit, createdAt: _c, updatedAt: _u, ...rest } = v;
    return {
      ...rest,
      summary: describeVoucher(v),
      usedPercent: usageLimit ? Math.min(100, Math.round((usedCount * 100) / usageLimit)) : null,
      ...(saved === undefined ? {} : { saved }),
    };
  }

  private static activeWhere(now = new Date()): Prisma.VoucherWhereInput {
    return { isActive: true, endsAt: { gt: now } };
  }

  /** Voucher công khai đang/sắp diễn ra (trang "Kho voucher") */
  async listPublic(userId?: string): Promise<VoucherView[]> {
    const rows = await this.prisma.voucher.findMany({
      where: { ...VouchersService.activeWhere(), isPublic: true },
      orderBy: [{ endsAt: 'asc' }],
      take: 100,
      include: userId ? { savedBy: { where: { userId }, select: { userId: true } } } : undefined,
    });
    return rows.map((v) => VouchersService.toView(v, userId ? (v as typeof v & { savedBy: unknown[] }).savedBy.length > 0 : undefined));
  }

  async wallet(userId: string): Promise<VoucherView[]> {
    const rows = await this.prisma.userVoucher.findMany({
      where: { userId, voucher: VouchersService.activeWhere() },
      include: { voucher: true },
      orderBy: { voucher: { endsAt: 'asc' } },
    });
    return rows.map((r) => VouchersService.toView(r.voucher, true));
  }

  /** "Lưu" voucher vào ví (cả mã riêng nhập tay); lưu lại lần nữa không lỗi */
  async save(userId: string, code: string): Promise<VoucherView> {
    const voucher = await this.prisma.voucher.findUnique({ where: { code } });
    if (!voucher || !voucher.isActive || voucher.endsAt <= new Date()) {
      throw new AppError(ErrorCode.VOUCHER_NOT_FOUND, 'Mã voucher không tồn tại hoặc đã hết hạn', HttpStatus.NOT_FOUND);
    }
    await this.prisma.userVoucher.upsert({
      where: { userId_voucherId: { userId, voucherId: voucher.id } },
      update: {},
      create: { userId, voucherId: voucher.id },
    });
    return VouchersService.toView(voucher, true);
  }

  /** Ứng viên ở trang thanh toán: voucher công khai + voucher trong ví + mã nhập tay */
  async candidates(userId: string, codes: string[]): Promise<Voucher[]> {
    return this.prisma.voucher.findMany({
      where: {
        AND: [
          VouchersService.activeWhere(),
          { OR: [{ isPublic: true }, { savedBy: { some: { userId } } }, ...(codes.length ? [{ code: { in: codes } }] : [])] },
        ],
      },
      orderBy: [{ endsAt: 'asc' }],
      take: 100,
    });
  }

  async findByCodes(codes: string[]): Promise<Voucher[]> {
    return codes.length ? this.prisma.voucher.findMany({ where: { code: { in: codes } } }) : [];
  }

  /** Số lần người dùng đã dùng từng voucher (đơn bị hủy đã được trả lượt nên không tính) */
  async usageByUser(userId: string, voucherIds: string[]): Promise<Map<string, number>> {
    if (voucherIds.length === 0) return new Map();
    const rows = await this.prisma.voucherUsage.groupBy({ by: ['voucherId'], where: { userId, voucherId: { in: voucherIds } }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.voucherId, r._count._all]));
  }

  /**
   * Trừ lượt dùng an toàn khi nhiều người dùng cùng lúc (gọi trong transaction tạo đơn):
   * 1. UPDATE ... SET used_count = used_count + 1 WHERE used_count < usage_limit → hết lượt thì 0 dòng → lỗi
   * 2. UPDATE khóa dòng voucher tới khi commit → các đơn cùng voucher xếp hàng; sau đó mới đếm lượt của người dùng
   *    (READ COMMITTED: câu đếm thấy được lượt mà transaction trước vừa commit) → không vượt giới hạn mỗi người
   */
  async reserve(tx: Prisma.TransactionClient, userId: string, orderId: string, applied: AppliedVoucher[]): Promise<void> {
    for (const { voucher, discount } of [...applied].sort((a, b) => a.voucher.id.localeCompare(b.voucher.id))) {
      const updated = await tx.$executeRaw`
        UPDATE vouchers SET used_count = used_count + 1, updated_at = now()
        WHERE id = ${voucher.id}::uuid AND is_active AND starts_at <= now() AND ends_at > now()
          AND (usage_limit IS NULL OR used_count < usage_limit)`;
      if (updated !== 1) {
        throw new AppError(ErrorCode.VOUCHER_EXHAUSTED, `Voucher ${voucher.code} vừa hết lượt hoặc hết hạn`, HttpStatus.CONFLICT, { code: voucher.code });
      }
      const used = await tx.voucherUsage.count({ where: { voucherId: voucher.id, userId } });
      if (used >= voucher.perUserLimit) {
        throw new AppError(ErrorCode.VOUCHER_USER_LIMIT, `Bạn đã dùng hết lượt của voucher ${voucher.code}`, HttpStatus.CONFLICT, { code: voucher.code });
      }
      await tx.voucherUsage.create({ data: { voucherId: voucher.id, userId, orderId, discount } });
    }
  }

  /** Trả lượt voucher của 1 đơn (đơn bị hủy) */
  async release(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const usages = await tx.voucherUsage.findMany({ where: { orderId }, select: { id: true, voucherId: true }, orderBy: { voucherId: 'asc' } });
    for (const u of usages) {
      await tx.$executeRaw`UPDATE vouchers SET used_count = GREATEST(used_count - 1, 0), updated_at = now() WHERE id = ${u.voucherId}::uuid`;
    }
    if (usages.length) {
      await tx.voucherUsage.deleteMany({ where: { orderId } });
      this.logger.log({ event: 'voucher.released', orderId, count: usages.length });
    }
  }

  // ---------------- Quản trị ----------------

  adminList(): Promise<Voucher[]> {
    return this.prisma.voucher.findMany({ orderBy: [{ isActive: 'desc' }, { endsAt: 'desc' }], take: 500 });
  }

  async create(dto: CreateVoucherDto): Promise<Voucher> {
    VouchersService.assertConfig(dto);
    const exists = await this.prisma.voucher.findUnique({ where: { code: dto.code }, select: { id: true } });
    if (exists) throw new AppError(ErrorCode.CONFLICT, 'Mã voucher đã tồn tại', HttpStatus.CONFLICT);
    return this.prisma.voucher.create({ data: { ...dto, maxDiscount: dto.maxDiscount ?? null, usageLimit: dto.usageLimit ?? null } });
  }

  async update(id: string, dto: UpdateVoucherDto): Promise<Voucher> {
    const current = await this.prisma.voucher.findUnique({ where: { id } });
    if (!current) throw new AppError(ErrorCode.VOUCHER_NOT_FOUND, 'Không tìm thấy voucher', HttpStatus.NOT_FOUND);
    const next = { ...current, ...dto };
    VouchersService.assertConfig(next);
    if (next.usageLimit !== null && next.usageLimit !== undefined && next.usageLimit < current.usedCount) {
      throw new AppError(ErrorCode.BAD_REQUEST, `Tổng lượt không được nhỏ hơn số lượt đã dùng (${current.usedCount})`);
    }
    return this.prisma.voucher.update({ where: { id }, data: dto });
  }

  static assertConfig(v: Pick<CreateVoucherDto, 'type' | 'value' | 'startsAt' | 'endsAt'>): void {
    if (v.type === VoucherType.PERCENT && (v.value < 1 || v.value > 100)) throw new AppError(ErrorCode.BAD_REQUEST, 'Voucher % phải từ 1 đến 100');
    if (v.type === VoucherType.FIXED && v.value < 1) throw new AppError(ErrorCode.BAD_REQUEST, 'Số tiền giảm phải lớn hơn 0');
    if (new Date(v.endsAt) <= new Date(v.startsAt)) throw new AppError(ErrorCode.BAD_REQUEST, 'Thời gian kết thúc phải sau thời gian bắt đầu');
  }
}
