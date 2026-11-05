import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { ORDER_TRANSITIONS, OrdersService } from './orders.service';

describe('OrdersService', () => {
  const userId = '7f0c2f4e-1b1a-4d3e-9a51-3c4f7e1d2a10';
  const orderId = '2b0f8a1c-3d4e-4f50-8a6b-7c8d9e0f1a2b';
  const productId = 'b8f3f5a2-55a1-4b8e-8f3e-0c1f2a3b4c5d';
  const replayUuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const dto = { shippingAddress: '12 Nguyễn Huệ, Quận 1, TP.HCM', phone: '0901234567' };

  const tx = {
    product: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    order: { create: jest.fn(), updateMany: jest.fn() },
    orderItem: { findMany: jest.fn() },
  };
  const prisma = {
    order: { findUnique: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const cart = { getRaw: jest.fn(), clear: jest.fn() };
  const products = { invalidateCache: jest.fn() };
  const metrics = new MetricsService();

  const service = new OrdersService(
    prisma as unknown as PrismaService,
    cart as unknown as CartService,
    products as unknown as ProductsService,
    metrics,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  });

  describe('create', () => {
    it('returns the existing order for a replayed Idempotency-Key', async () => {
      const existing = { id: orderId, userId, items: [] };
      prisma.order.findUnique.mockResolvedValue(existing);

      await expect(service.create(userId, replayUuid, dto)).resolves.toBe(existing);
      expect(cart.getRaw).not.toHaveBeenCalled();
    });

    it('rejects an Idempotency-Key that belongs to another user', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: orderId, userId: 'someone-else', items: [] });

      await expect(service.create(userId, replayUuid, dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an empty cart', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      cart.getRaw.mockResolvedValue(new Map());

      await expect(service.create(userId, replayUuid, dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('computes total from database prices and clears the cart', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      cart.getRaw.mockResolvedValue(new Map([[productId, 2]]));
      tx.product.findMany.mockResolvedValue([{ id: productId, price: new Prisma.Decimal('1250000.50') }]);
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      tx.order.create.mockImplementation(({ data }) => ({ id: orderId, ...data, items: [] }));

      const order = await service.create(userId, replayUuid, dto);

      expect(order.totalAmount.toFixed(2)).toBe('2500001.00');
      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: productId, stock: { gte: 2 } },
        data: { stock: { decrement: 2 }, soldCount: { increment: 2 } },
      });
      expect(cart.clear).toHaveBeenCalledWith(userId);
      expect(products.invalidateCache).toHaveBeenCalled();
    });

    it('throws 409 and keeps the cart when stock is insufficient (no oversell)', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      cart.getRaw.mockResolvedValue(new Map([[productId, 5]]));
      tx.product.findMany.mockResolvedValue([{ id: productId, price: new Prisma.Decimal('100') }]);
      tx.product.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.create(userId, replayUuid, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(cart.clear).not.toHaveBeenCalled();
    });

    it('rejects when a product in the cart was removed or hidden', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      cart.getRaw.mockResolvedValue(new Map([[productId, 1]]));
      tx.product.findMany.mockResolvedValue([]);

      await expect(service.create(userId, replayUuid, dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }));
    });
  });

  describe('status transitions', () => {
    it.each([
      [OrderStatus.PENDING, OrderStatus.PAID, true],
      [OrderStatus.PAID, OrderStatus.SHIPPING, true],
      [OrderStatus.SHIPPING, OrderStatus.COMPLETED, true],
      [OrderStatus.SHIPPING, OrderStatus.CANCELLED, false],
      [OrderStatus.COMPLETED, OrderStatus.PENDING, false],
      [OrderStatus.CANCELLED, OrderStatus.PAID, false],
    ])('%s → %s allowed=%s', (from, to, allowed) => {
      expect(ORDER_TRANSITIONS[from].includes(to)).toBe(allowed);
    });

    it('rejects an invalid admin transition', async () => {
      prisma.order.findUnique.mockResolvedValue({ status: OrderStatus.COMPLETED });

      await expect(service.updateStatus(orderId, OrderStatus.CANCELLED, userId)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('restores stock when an order is cancelled', async () => {
      prisma.order.findUnique.mockResolvedValue({ status: OrderStatus.PAID });
      tx.order.updateMany.mockResolvedValue({ count: 1 });
      tx.orderItem.findMany.mockResolvedValue([{ productId, quantity: 3 }]);
      prisma.order.findUniqueOrThrow.mockResolvedValue({ id: orderId, status: OrderStatus.CANCELLED });

      await service.updateStatus(orderId, OrderStatus.CANCELLED, userId);

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: orderId, status: OrderStatus.PAID },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: { stock: { increment: 3 }, soldCount: { decrement: 3 } },
      });
      expect(products.invalidateCache).toHaveBeenCalled();
    });

    it('returns 409 when another admin changed the order concurrently', async () => {
      prisma.order.findUnique.mockResolvedValue({ status: OrderStatus.PENDING });
      tx.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.updateStatus(orderId, OrderStatus.PAID, userId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not let a customer cancel a paid order', async () => {
      prisma.order.findFirst.mockResolvedValue({ status: OrderStatus.PAID });

      await expect(service.cancelMine(userId, orderId)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
