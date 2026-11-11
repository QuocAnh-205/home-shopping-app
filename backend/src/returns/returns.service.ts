import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType, OrderStatus, Prisma, ReturnRequest, ReturnStatus } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import { OrderLifecycleService, TransitionEvent } from '../orders/order-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export const RETURN_REASONS = [
  'Hàng lỗi, không hoạt động',
  'Hàng bị bể vỡ, móp méo khi vận chuyển',
  'Giao sai sản phẩm / sai mẫu',
  'Thiếu hàng, thiếu phụ kiện',
  'Hàng khác mô tả',
  'Hàng giả, hàng nhái',
] as const;

export type ReturnView = Omit<ReturnRequest, 'images'> & { images: string[] };

export interface ReturnFile {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);
  readonly windowDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.windowDays = Number(config.get<string>('RETURN_WINDOW_DAYS') ?? 15);
  }

  private async view(r: ReturnRequest): Promise<ReturnView> {
    const images = await Promise.all(r.images.map((k) => this.storage.getSignedImageUrl(k)));
    return { ...r, images: images.filter((u): u is string => Boolean(u)) };
  }

  /**
   * Khách gửi yêu cầu trả hàng/hoàn tiền (lý do + mô tả + tối đa 5 ảnh) khi đơn Đã giao / Hoàn thành
   * và còn trong RETURN_WINDOW_DAYS ngày kể từ lúc giao. Mỗi đơn 1 yêu cầu.
   */
  async request(userId: string, orderId: string, dto: { reason: string; description: string }, files: ReturnFile[]): Promise<ReturnView> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { status: true, deliveredAt: true, totalAmount: true, returnRequest: { select: { id: true } } },
    });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    if (order.returnRequest) throw new AppError(ErrorCode.RETURN_NOT_ALLOWED, 'Đơn hàng đã có yêu cầu trả hàng', HttpStatus.CONFLICT);
    if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.COMPLETED) {
      throw new AppError(ErrorCode.RETURN_NOT_ALLOWED, 'Chỉ yêu cầu trả hàng được khi đơn đã giao', HttpStatus.CONFLICT);
    }
    const deadline = (order.deliveredAt?.getTime() ?? 0) + this.windowDays * 86_400_000;
    if (Date.now() > deadline) {
      throw new AppError(ErrorCode.RETURN_NOT_ALLOWED, `Đã quá ${this.windowDays} ngày kể từ khi nhận hàng, không thể yêu cầu trả hàng`, HttpStatus.CONFLICT);
    }

    const images: string[] = [];
    for (const f of files) {
      const mime = StorageService.detectImageMime(f.buffer);
      if (!mime) throw new AppError(ErrorCode.BAD_REQUEST, 'Ảnh minh chứng phải là JPEG, PNG hoặc WEBP hợp lệ');
      images.push(await this.storage.uploadReturnImage(orderId, f.buffer, mime));
    }

    let event: TransitionEvent | undefined;
    const created = await this.prisma
      .$transaction(async (tx) => {
        const r = await tx.returnRequest.create({
          data: { orderId, userId, reason: dto.reason, description: dto.description, images, refundAmount: order.totalAmount },
        });
        event = await this.lifecycle.transition(orderId, OrderStatus.RETURN_REQUESTED, { type: ActorType.CUSTOMER, id: userId }, { tx, note: dto.reason });
        return r;
      })
      .catch((err) => {
        // 2 yêu cầu gửi cùng lúc: unique(order_id) chặn bản thứ 2
        if (ReturnsService.isUniqueViolation(err)) throw new AppError(ErrorCode.RETURN_NOT_ALLOWED, 'Đơn hàng đã có yêu cầu trả hàng', HttpStatus.CONFLICT);
        throw err;
      });
    await this.lifecycle.runAfterCommit(event!);
    this.logger.log({ event: 'return.requested', orderId, returnId: created.id, userId, reason: dto.reason, images: images.length });
    return this.view(created);
  }

  async mine(userId: string, orderId: string): Promise<ReturnView | null> {
    const r = await this.prisma.returnRequest.findFirst({ where: { orderId, userId } });
    return r ? this.view(r) : null;
  }

  async list(status?: ReturnStatus) {
    const rows = await this.prisma.returnRequest.findMany({
      where: status ? { status } : {},
      include: { order: { select: { id: true, totalAmount: true, paymentMethod: true, paymentStatus: true, status: true } }, user: { select: { email: true, fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return Promise.all(rows.map(async (r) => ({ ...r, images: (await this.view(r)).images })));
  }

  /** Duyệt: đơn → Đã trả hàng/hoàn tiền (hoàn kho; đã trả tiền thì hook thanh toán tạo lệnh hoàn) */
  async approve(id: string, adminId: string, note?: string): Promise<ReturnView> {
    return this.resolve(id, adminId, ReturnStatus.APPROVED, OrderStatus.RETURNED, note ?? 'Cửa hàng chấp nhận yêu cầu trả hàng/hoàn tiền');
  }

  /** Từ chối (bắt buộc có lý do): đơn → Hoàn thành */
  async reject(id: string, adminId: string, note: string): Promise<ReturnView> {
    return this.resolve(id, adminId, ReturnStatus.REJECTED, OrderStatus.COMPLETED, `Từ chối trả hàng: ${note}`);
  }

  private async resolve(id: string, adminId: string, status: ReturnStatus, orderStatus: OrderStatus, note: string): Promise<ReturnView> {
    let event: TransitionEvent | undefined;
    const r = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.returnRequest.updateMany({
        where: { id, status: ReturnStatus.REQUESTED },
        data: { status, adminNote: note.slice(0, 500), resolvedById: adminId, resolvedAt: new Date() },
      });
      if (updated.count !== 1) {
        const exists = await tx.returnRequest.findUnique({ where: { id }, select: { id: true } });
        throw exists
          ? new AppError(ErrorCode.CONFLICT, 'Yêu cầu trả hàng đã được xử lý', HttpStatus.CONFLICT)
          : new AppError(ErrorCode.RETURN_NOT_FOUND, 'Không tìm thấy yêu cầu trả hàng', HttpStatus.NOT_FOUND);
      }
      const row = await tx.returnRequest.findUniqueOrThrow({ where: { id } });
      event = await this.lifecycle.transition(row.orderId, orderStatus, { type: ActorType.ADMIN, id: adminId }, { tx, note });
      return row;
    });
    await this.lifecycle.runAfterCommit(event!);
    this.logger.log({ event: `return.${status.toLowerCase()}`, returnId: id, orderId: r.orderId, adminId });
    return this.view(r);
  }

  static isUniqueViolation(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }
}
