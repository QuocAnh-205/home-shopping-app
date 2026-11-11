import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { NotificationType, OrderPaymentStatus, PaymentMethod, PaymentStatus, Prisma, Refund, RefundStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError, ErrorCode } from '../common/errors';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentGatewayRegistry } from './gateway.registry';

/**
 * Hoàn tiền khi đơn ĐÃ TRẢ TIỀN bị hủy hoặc trả hàng:
 * - VNPay / MoMo: gọi API refund của cổng; lỗi → FAILED, admin bấm "Thử lại"
 * - VietQR / COD: không có API → MANUAL_REQUIRED, cửa hàng chuyển khoản lại rồi đánh dấu đã hoàn
 * Mỗi giao dịch thanh toán chỉ có tối đa 1 lệnh hoàn (payment_id unique) → gọi lặp không hoàn 2 lần.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentGatewayRegistry,
    private readonly metrics: MetricsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async notifyRefund(orderId: string, amount: number, manual: boolean): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { userId: true } });
    if (!order) return;
    const code = `#${orderId.slice(0, 8).toUpperCase()}`;
    const money = `${amount.toLocaleString('vi-VN')}₫`;
    await this.notifications.notify(
      order.userId,
      manual
        ? {
            type: NotificationType.PAYMENT,
            title: 'Cửa hàng sẽ chuyển khoản hoàn tiền',
            body: `Đơn ${code} được hoàn ${money} bằng chuyển khoản. Kiểm tra tài khoản ngân hàng mặc định trong Tài khoản → Ngân hàng để nhận tiền đúng.`,
            link: '/account?tab=bank',
            dedupeKey: `refund:manual:${orderId}:${amount}`,
          }
        : {
            type: NotificationType.PAYMENT,
            title: 'Hoàn tiền thành công',
            body: `Đã hoàn ${money} cho đơn ${code}. Tiền về tài khoản/ví bạn đã thanh toán sau 1–7 ngày làm việc tùy ngân hàng.`,
            link: `/orders/${orderId}`,
            dedupeKey: `refund:done:${orderId}:${amount}`,
          },
    );
  }

  /** Tạo lệnh hoàn cho mọi khoản đã thu của đơn rồi thử hoàn ngay */
  async refundOrder(orderId: string, reason: string): Promise<Refund[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentMethod: true, paymentStatus: true, totalAmount: true, payments: { where: { status: PaymentStatus.SUCCEEDED }, include: { refunds: true } } },
    });
    if (!order) return [];

    const created: Refund[] = [];
    for (const p of order.payments) {
      if (p.refunds.length) continue;
      const refund = await this.prisma.refund
        .create({ data: { orderId, paymentId: p.id, amount: p.amount, reason: reason.slice(0, 255) } })
        .catch((err) => (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' ? null : Promise.reject(err)));
      if (refund) created.push(refund);
    }
    // COD đã thu tiền khi giao rồi khách trả hàng: không có giao dịch online → hoàn tay
    if (order.paymentMethod === PaymentMethod.COD && order.paymentStatus === OrderPaymentStatus.REFUND_PENDING) {
      const exists = await this.prisma.refund.findFirst({ where: { orderId, paymentId: null } });
      if (!exists) {
        created.push(
          await this.prisma.refund.create({
            data: { orderId, amount: order.totalAmount, reason: reason.slice(0, 255), status: RefundStatus.MANUAL_REQUIRED },
          }),
        );
      }
    }

    const results: Refund[] = [];
    for (const r of created) results.push(r.status === RefundStatus.PENDING ? await this.attempt(r.id) : r);
    return results;
  }

  /** Gọi API hoàn tiền của cổng cho 1 lệnh hoàn (PENDING / FAILED) */
  async attempt(refundId: string): Promise<Refund> {
    // Chiếm lệnh hoàn bằng UPDATE có điều kiện → 2 tiến trình không cùng gọi cổng cho 1 lệnh
    const claimed = await this.prisma.refund.updateMany({
      where: { id: refundId, status: { in: [RefundStatus.PENDING, RefundStatus.FAILED] } },
      data: { status: RefundStatus.PENDING, attempts: { increment: 1 } },
    });
    const refund = await this.prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
    if (claimed.count !== 1) return refund;

    const gw = refund.payment ? this.registry.forPayment(refund.payment) : undefined;
    if (!refund.payment || !gw?.supportsRefund || !gw.refund) {
      const r = await this.prisma.refund.update({ where: { id: refundId }, data: { status: RefundStatus.MANUAL_REQUIRED } });
      await this.notifyRefund(refund.orderId, refund.amount, true);
      this.logger.warn({ event: 'refund.manual_required', refundId, orderId: refund.orderId, amount: refund.amount, method: refund.payment?.method ?? 'COD' });
      this.metrics.refundsTotal.inc({ result: 'manual' });
      return r;
    }

    try {
      const result = await gw.refund({
        txnRef: refund.payment.txnRef,
        gatewayTxnId: refund.payment.gatewayTxnId,
        amount: refund.amount,
        paymentCreatedAt: refund.payment.createdAt,
        rawCreate: refund.payment.rawCreate,
        reason: refund.reason,
        clientIp: '127.0.0.1',
      });
      if (!result.ok) throw Object.assign(new Error(result.error ?? 'refund failed'), { raw: result.raw });
      const done = await this.prisma.refund.update({
        where: { id: refundId },
        data: { status: RefundStatus.SUCCEEDED, gatewayRefundId: result.gatewayRefundId ?? null, raw: (result.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue, completedAt: new Date(), lastError: null },
      });
      await this.markOrderRefunded(refund.orderId);
      await this.notifyRefund(refund.orderId, refund.amount, false);
      this.logger.log({ event: 'refund.succeeded', refundId, orderId: refund.orderId, amount: refund.amount, method: refund.payment.method });
      this.metrics.refundsTotal.inc({ result: 'succeeded' });
      return done;
    } catch (err) {
      const raw = (err as { raw?: unknown }).raw;
      const failed = await this.prisma.refund.update({
        where: { id: refundId },
        data: { status: RefundStatus.FAILED, lastError: (err as Error).message.slice(0, 500), raw: (raw ?? Prisma.JsonNull) as Prisma.InputJsonValue },
      });
      this.logger.error({ event: 'refund.failed', refundId, orderId: refund.orderId, amount: refund.amount, err: (err as Error).message });
      this.metrics.refundsTotal.inc({ result: 'failed' });
      return failed;
    }
  }

  /** Admin: thử lại lệnh hoàn bị lỗi */
  async retry(refundId: string): Promise<Refund> {
    const r = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy lệnh hoàn tiền', HttpStatus.NOT_FOUND);
    if (r.status !== RefundStatus.FAILED) throw new AppError(ErrorCode.CONFLICT, 'Chỉ thử lại được lệnh hoàn đang lỗi', HttpStatus.CONFLICT);
    return this.attempt(refundId);
  }

  /** Admin: đánh dấu đã hoàn tay (chuyển khoản lại cho khách) */
  async completeManually(refundId: string, adminId: string, note?: string): Promise<Refund> {
    const updated = await this.prisma.refund.updateMany({
      where: { id: refundId, status: { in: [RefundStatus.MANUAL_REQUIRED, RefundStatus.FAILED] } },
      data: { status: RefundStatus.SUCCEEDED, completedAt: new Date(), raw: { manual: true, by: adminId, note: note ?? null } },
    });
    if (updated.count !== 1) throw new AppError(ErrorCode.CONFLICT, 'Lệnh hoàn không ở trạng thái chờ hoàn tay', HttpStatus.CONFLICT);
    const r = await this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    await this.markOrderRefunded(r.orderId);
    await this.notifyRefund(r.orderId, r.amount, false);
    this.logger.log({ event: 'refund.manual_completed', refundId, orderId: r.orderId, amount: r.amount, adminId });
    return r;
  }

  list(status?: RefundStatus) {
    return this.prisma.refund.findMany({
      where: status ? { status } : {},
      include: {
        payment: { select: { method: true, txnRef: true, gatewayTxnId: true } },
        order: {
          select: {
            id: true,
            totalAmount: true,
            user: {
              select: {
                email: true,
                fullName: true,
                phone: true,
                // Tài khoản nhận tiền hoàn của khách (hoàn tay khi chuyển khoản / COD)
                bankAccounts: { where: { isDefault: true }, select: { bankName: true, accountNo: true, holderName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Mọi lệnh hoàn của đơn đã xong → đơn chuyển "Đã hoàn tiền" */
  private async markOrderRefunded(orderId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE orders SET payment_status = 'REFUNDED', updated_at = now()
      WHERE id = ${orderId}::uuid AND payment_status = 'REFUND_PENDING'
        AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.order_id = orders.id AND r.status <> 'SUCCEEDED')`;
  }
}
