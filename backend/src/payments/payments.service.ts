import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType, OrderPaymentStatus, OrderStatus, Payment, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { CheckoutService, PaymentMethodOption } from '../checkout/checkout.service';
import { AppError, ErrorCode } from '../common/errors';
import { MetricsService } from '../metrics/metrics.service';
import { OrderLifecycleService, TransitionEvent } from '../orders/order-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentGatewayRegistry } from './gateway.registry';
import { AckKind, GatewayNotification, VietQrData } from './gateways/gateway.types';
import { RefundsService } from './refunds.service';

type OnlineMethod = Exclude<PaymentMethod, 'COD'>;

/** Thông tin thanh toán trả cho khách (không có dữ liệu thô của cổng) */
export interface PaymentView {
  id: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  payUrl: string | null;
  qr: VietQrData | null;
  expiresAt: Date;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  /** Đang dùng cổng giả lập (sandbox nội bộ) */
  sandbox: boolean;
  /** Chuyển khoản qua mã VietQR (MoMo / VNPay-QR / app ngân hàng): chờ cửa hàng đối soát */
  transfer: boolean;
}

type ProcessResult =
  | { kind: 'processed'; payment: Payment; event?: TransitionEvent }
  | { kind: 'late_paid'; payment: Payment; orderStatus: OrderStatus }
  | { kind: 'duplicate' | 'failed' | 'amount_mismatch'; payment: Payment };

const ACK: Record<ProcessResult['kind'], AckKind> = {
  processed: 'ok',
  late_paid: 'ok',
  failed: 'ok',
  duplicate: 'duplicate',
  amount_mismatch: 'invalid_amount',
};

const LABEL: Record<PaymentMethod, string> = { COD: 'COD', VNPAY: 'VNPay', MOMO: 'MoMo', VIETQR: 'chuyển khoản VietQR' };

/** Nhãn khi VNPay / MoMo chạy ở chế độ quét mã VietQR của cửa hàng */
const TRANSFER_LABEL: Record<'VNPAY' | 'MOMO' | 'VIETQR', string> = {
  VIETQR: 'Chuyển khoản ngân hàng (mọi ngân hàng, quét mã VietQR)',
  MOMO: 'Ví MoMo (quét mã QR bằng app MoMo)',
  VNPAY: 'VNPay-QR (quét bằng app ngân hàng)',
};

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentGatewayRegistry,
    private readonly lifecycle: OrderLifecycleService,
    private readonly checkout: CheckoutService,
    private readonly refunds: RefundsService,
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.transferHoldHours = Number(config.get<string>('TRANSFER_CONFIRM_HOURS') ?? 24);
    this.transferAutoConfirm = config.get<string>('TRANSFER_AUTO_CONFIRM') === 'true';
  }

  /** Giờ giữ hàng sau khi khách báo đã chuyển khoản (chờ cửa hàng đối soát) */
  readonly transferHoldHours: number;
  /** Chế độ demo: khách bấm "Tôi đã chuyển khoản" → tự xác nhận thanh toán + chuẩn bị hàng (không chờ đối soát) */
  transferAutoConfirm: boolean;

  onModuleInit(): void {
    this.checkout.setPaymentMethodsProvider(() => this.methods());
    this.lifecycle.register({
      name: 'payments',
      // Hủy đơn → mọi lần thử thanh toán còn mở bị đóng (link cũ không trả tiền được nữa)
      inTx: async (tx, e) => {
        if (e.to !== OrderStatus.CANCELLED) return;
        await tx.payment.updateMany({
          where: { orderId: e.orderId, status: PaymentStatus.PENDING },
          data: { status: e.actor.type === ActorType.SYSTEM ? PaymentStatus.EXPIRED : PaymentStatus.CANCELLED },
        });
      },
      // Đơn đã trả tiền bị hủy / trả hàng → hoàn tiền qua cổng (ngoài transaction: gọi API bên ngoài)
      afterCommit: async (e) => {
        if (e.paymentStatus === OrderPaymentStatus.REFUND_PENDING) {
          await this.refunds.refundOrder(e.orderId, e.note ?? (e.to === OrderStatus.RETURNED ? 'Trả hàng/hoàn tiền' : 'Đơn hàng đã hủy'));
        }
      },
    });
  }

  methods(): PaymentMethodOption[] {
    const online = (['VNPAY', 'MOMO', 'VIETQR'] as const).map((m) => {
      const gw = this.registry.get(m);
      return {
        method: m,
        label: gw.transfer ? TRANSFER_LABEL[m] : `${CheckoutService.paymentLabel(m)}${gw.mock ? ' – sandbox' : ''}`,
        available: gw.configured,
        ...(gw.configured ? {} : { reason: 'Cửa hàng chưa kích hoạt phương thức này' }),
      };
    });
    return [{ method: PaymentMethod.COD, label: CheckoutService.paymentLabel(PaymentMethod.COD), available: true }, ...online];
  }

  private view(p: Payment): PaymentView {
    return {
      id: p.id,
      method: p.method,
      amount: p.amount,
      status: p.status,
      payUrl: p.status === PaymentStatus.PENDING ? p.payUrl : null,
      qr: p.status === PaymentStatus.PENDING ? (p.qrData as unknown as VietQrData | null) : null,
      expiresAt: p.expiresAt,
      paidAt: p.paidAt,
      failureReason: p.failureReason,
      createdAt: p.createdAt,
      sandbox: Boolean((p.rawCreate as { mock?: boolean } | null)?.mock),
      transfer: Boolean((p.rawCreate as { transfer?: boolean } | null)?.transfer),
    };
  }

  async listForOrder(userId: string, orderId: string): Promise<PaymentView[]> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId }, select: { id: true } });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    const rows = await this.prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
    return rows.map((p) => this.view(p));
  }

  /**
   * Bắt đầu / thanh toán lại / đổi phương thức cho đơn đang Chờ thanh toán.
   * - Cùng phương thức + link cũ còn hạn → trả lại link cũ (bấm "Thanh toán" nhiều lần không tạo nhiều giao dịch)
   * - Đổi sang COD → đơn chuyển Chờ xác nhận, không cần trả trước
   * - Đổi cổng online → đóng link cũ, tạo giao dịch mới
   */
  async start(userId: string, orderId: string, method: PaymentMethod | undefined, clientIp: string): Promise<PaymentView | null> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, status: true, paymentMethod: true, paymentExpiresAt: true, totalAmount: true },
    });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    if (order.status !== OrderStatus.AWAITING_PAYMENT) {
      throw new AppError(ErrorCode.PAYMENT_NOT_ALLOWED, 'Đơn hàng không ở trạng thái chờ thanh toán', HttpStatus.CONFLICT);
    }
    if (!order.paymentExpiresAt || order.paymentExpiresAt <= new Date()) {
      throw new AppError(ErrorCode.PAYMENT_EXPIRED, 'Đơn hàng đã quá hạn thanh toán', HttpStatus.CONFLICT);
    }
    const target = method ?? order.paymentMethod;

    if (target === PaymentMethod.COD) {
      await this.lifecycle.transition(orderId, OrderStatus.PENDING, { type: ActorType.CUSTOMER, id: userId }, {
        note: 'Đổi sang thanh toán khi nhận hàng',
        data: { paymentMethod: PaymentMethod.COD, paymentExpiresAt: null },
      });
      await this.prisma.payment.updateMany({ where: { orderId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.CANCELLED } });
      this.logger.log({ event: 'payment.method_changed', orderId, from: order.paymentMethod, to: target });
      return null;
    }

    const gw = this.registry.get(target);
    if (!gw.configured) throw new AppError(ErrorCode.PAYMENT_METHOD_UNAVAILABLE, `${LABEL[target]} hiện chưa được hỗ trợ`, HttpStatus.BAD_REQUEST);

    if (target !== order.paymentMethod) {
      const moved = await this.prisma.order.updateMany({ where: { id: orderId, status: OrderStatus.AWAITING_PAYMENT }, data: { paymentMethod: target } });
      if (moved.count !== 1) throw new AppError(ErrorCode.ORDER_CONCURRENT_UPDATE, 'Đơn hàng vừa được cập nhật, vui lòng tải lại', HttpStatus.CONFLICT);
      this.logger.log({ event: 'payment.method_changed', orderId, from: order.paymentMethod, to: target });
    }

    const open = await this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.PENDING, method: target, amount: order.totalAmount, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (open && (open.payUrl || open.qrData)) return this.view(open);
    await this.prisma.payment.updateMany({ where: { orderId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.CANCELLED } });

    // Mã tham chiếu duy nhất, chỉ chữ + số (yêu cầu của VNPay, dùng làm nội dung chuyển khoản VietQR)
    const txnRef = `HS${orderId.slice(0, 8).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`;
    const payment = await this.prisma.payment.create({
      data: { orderId, method: target, amount: order.totalAmount, txnRef, expiresAt: order.paymentExpiresAt, rawCreate: gw.mock ? { mock: true } : Prisma.JsonNull },
    });
    try {
      const res = await gw.create({
        txnRef,
        amount: order.totalAmount,
        orderId,
        orderInfo: `Thanh toan don hang #${orderId.slice(0, 8).toUpperCase()}`,
        expiresAt: order.paymentExpiresAt,
        returnUrl: this.registry.returnUrl(orderId),
        ipnUrl: this.registry.ipnUrl(target as OnlineMethod),
        clientIp,
      });
      const saved = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          payUrl: res.payUrl ?? null,
          qrData: res.qr ? (res.qr as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          rawCreate: { ...(gw.mock ? { mock: true } : {}), ...((res.raw as object) ?? {}) } as Prisma.InputJsonValue,
        },
      });
      this.logger.log({ event: 'payment.created', orderId, paymentId: payment.id, method: target, amount: order.totalAmount, txnRef, sandbox: Boolean(gw.mock) });
      return this.view(saved);
    } catch (err) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, failureReason: (err as Error).message.slice(0, 255) } });
      this.logger.error({ event: 'payment.create_failed', orderId, method: target, err: (err as Error).message });
      throw new AppError(ErrorCode.PAYMENT_GATEWAY_ERROR, `Không kết nối được ${LABEL[target]}, vui lòng thử lại hoặc chọn phương thức khác`, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * IPN/webhook từ server cổng thanh toán – nơi DUY NHẤT xác nhận đã trả tiền:
   * 1. Kiểm chữ ký (sai → từ chối, vẫn ghi nhật ký)
   * 2. Khóa dòng payment (SELECT … FOR UPDATE) → cổng gọi lại nhiều lần / gọi song song chỉ xử lý 1 lần
   * 3. Đối chiếu số tiền với giao dịch đã tạo
   * 4. Thành công → đơn Chờ thanh toán → Chờ xác nhận (cùng transaction); đơn đã hủy/hết hạn mà tiền vẫn về → hoàn tiền
   */
  async handleNotification(method: OnlineMethod, payload: Record<string, unknown>, opts: { mock?: boolean } = {}): Promise<{ status: number; body: unknown }> {
    const gw = opts.mock ? this.registry.mock(method) : this.registry.get(method);
    if (!gw) return { status: 404, body: { message: 'Not found' } };

    const notif = gw.verifyNotification(payload);
    if (!notif) {
      const ref = gw.peekTxnRef(payload);
      const p = ref ? await this.prisma.payment.findUnique({ where: { txnRef: ref }, select: { id: true } }) : null;
      await this.event(p?.id ?? null, method, 'IPN', false, 'invalid_signature', payload);
      this.metrics.paymentsTotal.inc({ method, result: 'invalid_signature' });
      this.logger.warn({ event: 'payment.ipn_rejected', method, reason: 'invalid_signature', txnRef: ref });
      return gw.ack('invalid_signature');
    }
    const kind = await this.apply(method, notif, 'IPN', true);
    return gw.ack(kind);
  }

  /**
   * Khách báo "Tôi đã chuyển khoản" (VietQR / MoMo / VNPay-QR quét mã của cửa hàng): không đổi trạng thái tiền
   * (chỉ cửa hàng xác nhận sau khi thấy tiền về), nhưng gia hạn giữ hàng TRANSFER_CONFIRM_HOURS để đơn không bị
   * job tự hủy khi cửa hàng chưa kịp đối soát. Gọi lại nhiều lần không gia hạn thêm.
   */
  async claimTransfer(userId: string, orderId: string): Promise<{ transferClaimedAt: Date; paymentExpiresAt: Date | null; autoConfirmed: boolean }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { status: true, paymentExpiresAt: true, transferClaimedAt: true },
    });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', HttpStatus.NOT_FOUND);
    if (order.transferClaimedAt && order.paymentExpiresAt) {
      return { transferClaimedAt: order.transferClaimedAt, paymentExpiresAt: order.paymentExpiresAt, autoConfirmed: false };
    }
    if (order.status !== OrderStatus.AWAITING_PAYMENT || !order.paymentExpiresAt || order.paymentExpiresAt <= new Date()) {
      throw new AppError(ErrorCode.PAYMENT_NOT_ALLOWED, 'Đơn hàng không còn chờ thanh toán', HttpStatus.CONFLICT);
    }
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.PENDING, NOT: { qrData: { equals: Prisma.DbNull } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) throw new AppError(ErrorCode.PAYMENT_NOT_ALLOWED, 'Đơn hàng chưa có mã chuyển khoản', HttpStatus.CONFLICT);

    const now = new Date();
    const until = new Date(now.getTime() + this.transferHoldHours * 3600_000);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.AWAITING_PAYMENT, transferClaimedAt: null },
        data: { transferClaimedAt: now, paymentExpiresAt: until },
      });
      if (updated.count !== 1) throw new AppError(ErrorCode.ORDER_CONCURRENT_UPDATE, 'Đơn hàng vừa được cập nhật, vui lòng tải lại', HttpStatus.CONFLICT);
      await tx.payment.update({ where: { id: payment.id }, data: { expiresAt: until } });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: OrderStatus.AWAITING_PAYMENT,
          toStatus: OrderStatus.AWAITING_PAYMENT,
          actorType: ActorType.CUSTOMER,
          actorId: userId,
          note: `Khách báo đã chuyển khoản (nội dung ${payment.txnRef}), chờ cửa hàng xác nhận`,
        },
      });
    });
    await this.event(payment.id, payment.method, 'CLAIM', true, 'claimed', { txnRef: payment.txnRef, amount: payment.amount });
    this.logger.log({ event: 'payment.transfer_claimed', orderId, paymentId: payment.id, method: payment.method, amount: payment.amount, holdUntil: until });

    if (this.transferAutoConfirm) {
      await this.autoConfirmTransfer(orderId, payment.id, payment.method as OnlineMethod);
      return { transferClaimedAt: now, paymentExpiresAt: null, autoConfirmed: true };
    }
    return { transferClaimedAt: now, paymentExpiresAt: until, autoConfirmed: false };
  }

  /**
   * CHẾ ĐỘ DEMO (TRANSFER_AUTO_CONFIRM=true – dùng cho đồ án / báo cáo): coi như cửa hàng đã thấy tiền về ngay khi
   * khách báo chuyển khoản. Đi qua ĐÚNG luồng xác nhận như admin bấm tay (ghi nhật ký, đổi trạng thái tiền, thông báo),
   * rồi hệ thống xác nhận đơn → "Đang chuẩn bị hàng". Không bật cho cửa hàng thật.
   */
  private async autoConfirmTransfer(orderId: string, paymentId: string, method: OnlineMethod): Promise<void> {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const kind = await this.apply(
      method,
      {
        txnRef: p.txnRef,
        amount: p.amount,
        success: true,
        gatewayTxnId: `DEMO-${p.txnRef}`,
        message: 'Chế độ demo: tự xác nhận khi khách báo đã chuyển khoản',
        raw: { demo: true },
      },
      'MANUAL',
      true,
    );
    if (kind !== 'ok') {
      this.logger.warn({ event: 'payment.demo_auto_confirm_skipped', orderId, result: kind });
      return;
    }
    await this.lifecycle.transition(orderId, OrderStatus.PROCESSING, { type: ActorType.SYSTEM }, { note: 'Đã nhận thanh toán, cửa hàng bắt đầu chuẩn bị hàng' });
    this.logger.log({ event: 'payment.demo_auto_confirmed', orderId, paymentId, method });
  }

  /** Admin xác nhận đã nhận tiền (chuyển khoản VietQR đối soát theo sao kê) – đi qua cùng luồng với IPN */
  async confirmManually(paymentId: string, adminId: string, note?: string): Promise<PaymentView> {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy giao dịch thanh toán', HttpStatus.NOT_FOUND);
    if (p.method === PaymentMethod.COD) throw new AppError(ErrorCode.BAD_REQUEST, 'Giao dịch không hợp lệ');
    const kind = await this.apply(
      p.method as OnlineMethod,
      { txnRef: p.txnRef, amount: p.amount, success: true, gatewayTxnId: `MANUAL-${p.txnRef}`, message: note ?? 'Admin xác nhận đã nhận tiền', raw: { adminId, note: note ?? null } },
      'MANUAL',
      true,
    );
    if (kind === 'invalid_amount' || kind === 'not_found') throw new AppError(ErrorCode.CONFLICT, 'Không xác nhận được giao dịch', HttpStatus.CONFLICT);
    return this.view(await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }));
  }

  private async apply(method: OnlineMethod, notif: GatewayNotification, kind: 'IPN' | 'MANUAL', signatureValid: boolean): Promise<AckKind> {
    const payment = await this.prisma.payment.findUnique({ where: { txnRef: notif.txnRef } });
    if (!payment || payment.method !== method) {
      await this.event(null, method, kind, signatureValid, 'unknown_ref', notif.raw);
      this.metrics.paymentsTotal.inc({ method, result: 'unknown_ref' });
      this.logger.warn({ event: 'payment.ipn_rejected', method, reason: 'unknown_ref', txnRef: notif.txnRef });
      return 'not_found';
    }

    let result: ProcessResult;
    try {
      result = await this.prisma.$transaction((tx) => this.process(tx, payment.id, method, notif), { timeout: 15_000 });
    } catch (err) {
      await this.event(payment.id, method, kind, signatureValid, 'error', notif.raw);
      this.logger.error({ event: 'payment.ipn_error', method, paymentId: payment.id, err: (err as Error).message });
      return 'error';
    }
    await this.event(payment.id, method, kind, signatureValid, result.kind, notif.raw);
    this.metrics.paymentsTotal.inc({ method, result: result.kind });
    this.logger.log({
      event: `payment.${result.kind}`,
      method,
      via: kind,
      paymentId: payment.id,
      orderId: payment.orderId,
      txnRef: notif.txnRef,
      amount: notif.amount,
      expectedAmount: payment.amount,
      gatewayTxnId: notif.gatewayTxnId,
      message: notif.message,
    });

    if (result.kind === 'processed' && result.event) await this.lifecycle.runAfterCommit(result.event);
    if (result.kind === 'late_paid') {
      // Tiền về khi đơn đã hủy (quá hạn) hoặc đơn đã được trả bằng giao dịch khác → hoàn lại khoản này
      await this.refunds.refundOrder(payment.orderId, 'Thanh toán sau khi đơn đã hủy hoặc thanh toán trùng');
    }
    return ACK[result.kind];
  }

  private async process(tx: Prisma.TransactionClient, paymentId: string, method: OnlineMethod, notif: GatewayNotification): Promise<ProcessResult> {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const raw = (notif.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue;

    if (p.status === PaymentStatus.SUCCEEDED) return { kind: 'duplicate', payment: p };
    if (notif.amount !== p.amount) {
      const failed = await tx.payment.update({
        where: { id: p.id },
        data: { status: PaymentStatus.FAILED, failureReason: `Số tiền không khớp: nhận ${notif.amount}, cần ${p.amount}`, rawResult: raw },
      });
      return { kind: 'amount_mismatch', payment: failed };
    }
    if (!notif.success) {
      const failed =
        p.status === PaymentStatus.PENDING
          ? await tx.payment.update({ where: { id: p.id }, data: { status: PaymentStatus.FAILED, failureReason: notif.message?.slice(0, 255) ?? 'Giao dịch thất bại', rawResult: raw } })
          : p;
      return { kind: 'failed', payment: failed };
    }

    // Tiền đã về: luôn ghi nhận SUCCEEDED (kể cả link đã hết hạn) để đối soát và hoàn tiền nếu cần
    const now = new Date();
    const paid = await tx.payment.update({
      where: { id: p.id },
      data: { status: PaymentStatus.SUCCEEDED, paidAt: now, gatewayTxnId: notif.gatewayTxnId ?? null, rawResult: raw, failureReason: null },
    });
    const order = await tx.order.findUniqueOrThrow({ where: { id: p.orderId }, select: { status: true, paymentStatus: true } });
    if (order.status === OrderStatus.AWAITING_PAYMENT && order.paymentStatus === OrderPaymentStatus.UNPAID) {
      const event = await this.lifecycle.transition(p.orderId, OrderStatus.PENDING, { type: ActorType.SYSTEM }, {
        tx,
        note: `Thanh toán thành công qua ${LABEL[method]}`,
        data: { paymentStatus: OrderPaymentStatus.PAID, paidAt: now, paymentMethod: method, paymentExpiresAt: null },
      });
      return { kind: 'processed', payment: paid, event };
    }
    if (order.status === OrderStatus.CANCELLED && order.paymentStatus === OrderPaymentStatus.UNPAID) {
      await tx.order.update({ where: { id: p.orderId }, data: { paymentStatus: OrderPaymentStatus.REFUND_PENDING } });
    }
    return { kind: 'late_paid', payment: paid, orderStatus: order.status };
  }

  private async event(paymentId: string | null, provider: PaymentMethod, kind: string, signatureValid: boolean, result: string, payload: unknown): Promise<void> {
    await this.prisma.paymentEvent
      .create({ data: { paymentId, provider, kind, signatureValid, result, payload: (payload ?? {}) as Prisma.InputJsonValue } })
      .catch((err) => this.logger.error({ event: 'payment.event_log_failed', err: (err as Error).message }));
  }

  /** Admin: mọi lần thử thanh toán + nhật ký IPN thô + lệnh hoàn của 1 đơn */
  adminForOrder(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      include: {
        // Bỏ cột id BigInt (không tuần tự hóa JSON được)
        events: { select: { kind: true, result: true, signatureValid: true, payload: true, createdAt: true }, orderBy: { id: 'desc' }, take: 20 },
        refunds: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
