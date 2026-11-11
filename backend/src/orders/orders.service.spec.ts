import { ConfigService } from '@nestjs/config';
import { PaymentMethod, Prisma } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { CoinsService } from '../coins/coins.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CheckoutPlan, CheckoutPreview, CheckoutService } from '../checkout/checkout.service';
import { AppError } from '../common/errors';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersService } from './orders.service';

describe('OrdersService.create', () => {
  const userId = '7f0c2f4e-1b1a-4d3e-9a51-3c4f7e1d2a10';
  const orderId = '2b0f8a1c-3d4e-4f50-8a6b-7c8d9e0f1a2b';
  const productId = 'b8f3f5a2-55a1-4b8e-8f3e-0c1f2a3b4c5d';
  const idempotencyUuid = '0f8fad5b-d9cb-469f-a165-70867728950e';

  const tx = {
    product: { updateMany: jest.fn(), findUnique: jest.fn() },
    order: { create: jest.fn() },
  };
  const prisma = {
    order: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const cart = { removeItems: jest.fn() };
  const products = { invalidateCache: jest.fn() };
  const checkout = { build: jest.fn() };
  const vouchers = { reserve: jest.fn() };
  const coins = { spend: jest.fn() };
  const config = { get: () => undefined } as unknown as ConfigService;

  const service = new OrdersService(
    prisma as unknown as PrismaService,
    cart as unknown as CartService,
    products as unknown as ProductsService,
    new MetricsService(),
    {} as OrderLifecycleService,
    checkout as unknown as CheckoutService,
    vouchers as unknown as VouchersService,
    config,
    coins as unknown as CoinsService,
    { notify: jest.fn() } as unknown as NotificationsService,
  );

  const preview = (patch: Partial<CheckoutPreview> = {}): CheckoutPreview =>
    ({
      source: 'CART',
      items: [{ productId, name: 'Nồi chiên', slug: 'noi-chien', imageUrl: null, categoryId: 1, unitPrice: 1_250_000, quantity: 2, lineTotal: 2_500_000, stock: 10, available: true }],
      address: null,
      shipping: { fee: 30_000, provider: 'TABLE', estimatedDelivery: { from: '2026-11-13', to: '2026-11-14' }, chargeableWeightGrams: 3000, freeShipThreshold: 500_000, freeShipEligible: true, amountToFreeShip: 0 },
      vouchers: { voucherCode: null, shippingVoucherCode: null, discount: [], shipping: [], errors: [] },
      paymentMethod: PaymentMethod.COD,
      paymentMethods: [],
      pricing: { subtotal: 2_500_000, shippingFee: 30_000, discount: 0, shippingDiscount: 30_000, coinsUsed: 0, total: 2_500_000, saved: 30_000 },
      coins: { balance: 0, usable: 0, applied: 0, earnEstimate: 25_000 },
      issues: [],
      canPlaceOrder: true,
      ...patch,
    }) as CheckoutPreview;

  const plan = (p = preview()): CheckoutPlan => ({
    preview: p,
    address: { id: 'a1', userId, fullName: 'Lan', phone: '0901234567', street: '25 Nguyễn Huệ', ward: 'Phường Bến Thành', province: 'Thành phố Hồ Chí Minh', provinceCode: 79, wardCode: 26743 } as CheckoutPlan['address'],
    appliedVouchers: [],
    cartProductIds: [productId],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findUnique.mockResolvedValue(null);
    prisma.order.findUniqueOrThrow.mockResolvedValue({ id: orderId });
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.order.create.mockImplementation(({ data }) => ({ id: orderId, ...data }));
  });

  it('returns the existing order for a replayed Idempotency-Key without recomputing', async () => {
    const existing = { id: orderId, userId, items: [] };
    prisma.order.findUnique.mockResolvedValue(existing);
    await expect(service.create(userId, idempotencyUuid, {})).resolves.toBe(existing);
    expect(checkout.build).not.toHaveBeenCalled();
  });

  it("rejects another user's Idempotency-Key", async () => {
    prisma.order.findUnique.mockResolvedValue({ id: orderId, userId: 'someone-else' });
    await expect(service.create(userId, idempotencyUuid, {})).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('creates the order from server-side prices, decrements stock conditionally and removes only the bought items from the cart', async () => {
    checkout.build.mockResolvedValue(plan());

    await service.create(userId, idempotencyUuid, { expectedTotal: 2_500_000 });

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: productId, isActive: true, stock: { gte: 2 }, price: 1_250_000 },
      data: { stock: { decrement: 2 }, soldCount: { increment: 2 } },
    });
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'PENDING',
      subtotal: 2_500_000,
      shippingFee: 30_000,
      shippingDiscount: 30_000,
      totalAmount: 2_500_000,
      recipientName: 'Lan',
      shippingAddress: '25 Nguyễn Huệ, Phường Bến Thành, Thành phố Hồ Chí Minh',
      provinceCode: 79,
      paymentExpiresAt: null,
    });
    expect(data.items.create[0]).toMatchObject({ productName: 'Nồi chiên', productSlug: 'noi-chien', unitPrice: 1_250_000 });
    expect(vouchers.reserve).toHaveBeenCalledWith(tx, userId, orderId, []);
    expect(cart.removeItems).toHaveBeenCalledWith(userId, [productId]);
  });

  it('online payment → AWAITING_PAYMENT with a 15-minute hold', async () => {
    checkout.build.mockResolvedValue(plan(preview({ paymentMethod: PaymentMethod.VNPAY })));
    const before = Date.now();
    await service.create(userId, idempotencyUuid, {});
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.status).toBe('AWAITING_PAYMENT');
    expect(data.paymentExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000 - 1000);
  });

  it('refuses with PRICE_CHANGED when the total the customer saw is stale', async () => {
    checkout.build.mockResolvedValue(plan());
    await expect(service.create(userId, idempotencyUuid, { expectedTotal: 2_400_000 })).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
      details: expect.objectContaining({ expectedTotal: 2_400_000, total: 2_500_000 }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('surfaces the first checkout issue with a clear code', async () => {
    checkout.build.mockResolvedValue(plan(preview({ canPlaceOrder: false, issues: [{ code: 'OUT_OF_STOCK', message: 'Nồi chiên chỉ còn 1 sản phẩm', productId }] })));
    const err: AppError = await service.create(userId, idempotencyUuid, {}).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('OUT_OF_STOCK');
    expect(err.getStatus()).toBe(409);
  });

  it.each([
    [{ isActive: true, price: 1_250_000, stock: 1 }, 'OUT_OF_STOCK'],
    [{ isActive: true, price: 1_300_000, stock: 9 }, 'PRICE_CHANGED'],
    [{ isActive: false, price: 1_250_000, stock: 9 }, 'PRODUCT_UNAVAILABLE'],
  ])('race inside the transaction (%o) → %s, nothing is created', async (row, code) => {
    checkout.build.mockResolvedValue(plan());
    tx.product.updateMany.mockResolvedValue({ count: 0 });
    tx.product.findUnique.mockResolvedValue(row);

    await expect(service.create(userId, idempotencyUuid, {})).rejects.toMatchObject({ code });
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(cart.removeItems).not.toHaveBeenCalled();
  });

  it('a concurrent request with the same key returns the winner order (unique violation)', async () => {
    checkout.build.mockResolvedValue(plan());
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    prisma.order.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: orderId, userId });
    await expect(service.create(userId, idempotencyUuid, {})).resolves.toMatchObject({ id: orderId });
  });
});
