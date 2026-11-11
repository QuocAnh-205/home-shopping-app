import { ActorType, OrderPaymentStatus, OrderStatus, PaymentMethod } from '@prisma/client';
import { AppError } from '../common/errors';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { OrderLifecycleService } from './order-lifecycle.service';

describe('OrderLifecycleService', () => {
  const orderId = '2b0f8a1c-3d4e-4f50-8a6b-7c8d9e0f1a2b';
  const productId = 'b8f3f5a2-55a1-4b8e-8f3e-0c1f2a3b4c5d';
  const admin = { type: ActorType.ADMIN, id: '7f0c2f4e-1b1a-4d3e-9a51-3c4f7e1d2a10' };

  const tx = {
    order: { findUnique: jest.fn(), updateMany: jest.fn() },
    orderItem: { findMany: jest.fn() },
    product: { update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
  const products = { invalidateCache: jest.fn() };
  const service = new OrderLifecycleService(prisma as unknown as PrismaService, products as unknown as ProductsService, new MetricsService());

  const order = (status: OrderStatus, extra: Record<string, unknown> = {}) => ({
    status,
    userId: 'u1',
    paymentMethod: PaymentMethod.COD,
    paymentStatus: OrderPaymentStatus.UNPAID,
    totalAmount: 500000,
    ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tx.order.updateMany.mockResolvedValue({ count: 1 });
  });

  it('updates conditionally on the previous status and writes a history row', async () => {
    tx.order.findUnique.mockResolvedValue(order(OrderStatus.PENDING));

    await service.transition(orderId, OrderStatus.PROCESSING, admin, { note: 'Đã gọi xác nhận' });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: orderId, status: OrderStatus.PENDING },
      data: expect.objectContaining({ status: OrderStatus.PROCESSING, confirmedAt: expect.any(Date) }),
    });
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromStatus: 'PENDING', toStatus: 'PROCESSING', actorType: 'ADMIN', actorId: admin.id, note: 'Đã gọi xác nhận' }),
    });
  });

  it('rejects invalid transitions before touching the database', async () => {
    tx.order.findUnique.mockResolvedValue(order(OrderStatus.COMPLETED));
    await expect(service.transition(orderId, OrderStatus.CANCELLED, admin)).rejects.toBeInstanceOf(AppError);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 when the order changed concurrently', async () => {
    tx.order.findUnique.mockResolvedValue(order(OrderStatus.PENDING));
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.transition(orderId, OrderStatus.PROCESSING, admin)).rejects.toMatchObject({ code: 'ORDER_CONCURRENT_UPDATE' });
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('restocks items and records the reason when cancelling', async () => {
    tx.order.findUnique.mockResolvedValue(order(OrderStatus.PROCESSING));
    tx.orderItem.findMany.mockResolvedValue([{ productId, quantity: 3 }]);

    await service.transition(orderId, OrderStatus.CANCELLED, admin, { note: 'Hết hàng tại kho' });

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cancelReason: 'Hết hàng tại kho', cancelledBy: 'ADMIN', cancelledAt: expect.any(Date) }) }),
    );
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: productId }, data: { stock: { increment: 3 }, soldCount: { decrement: 3 } } });
    expect(products.invalidateCache).toHaveBeenCalled();
  });

  it('marks COD orders as paid when delivered', async () => {
    tx.order.findUnique.mockResolvedValue(order(OrderStatus.SHIPPING));
    const event = await service.transition(orderId, OrderStatus.DELIVERED, admin);
    expect(event.paymentStatus).toBe(OrderPaymentStatus.PAID);
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PAID', paidAt: expect.any(Date), deliveredAt: expect.any(Date) }) }),
    );
  });

  it('a paid order that gets cancelled moves to REFUND_PENDING and hooks run in order', async () => {
    tx.order.findUnique.mockResolvedValue(order(OrderStatus.PENDING, { paymentMethod: PaymentMethod.VNPAY, paymentStatus: OrderPaymentStatus.PAID }));
    tx.orderItem.findMany.mockResolvedValue([]);
    const calls: string[] = [];
    service.register({
      name: 'test',
      inTx: async (_tx, e) => void calls.push(`inTx:${e.paymentStatus}`),
      afterCommit: async (e) => void calls.push(`after:${e.to}`),
    });

    const event = await service.transition(orderId, OrderStatus.CANCELLED, { type: ActorType.CUSTOMER, id: 'u1' });

    expect(event.paymentStatus).toBe(OrderPaymentStatus.REFUND_PENDING);
    expect(calls).toEqual(['inTx:REFUND_PENDING', 'after:CANCELLED']);
  });
});
