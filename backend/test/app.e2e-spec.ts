/**
 * Integration test end-to-end trên PostgreSQL + Redis thật (CI dựng bằng service containers).
 *   DATABASE_URL=... REDIS_URL=... JWT_SECRET=... npm run test:e2e
 */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailMessage, MailService } from '../src/mail/mail.service';
import { OrderJobsService } from '../src/orders/order-jobs.service';
import { PaymentJobsService } from '../src/payments/payment-jobs.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Home Shopping API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = randomUUID().slice(0, 8);
  const password = 'E2eTest123';
  const created = { userIds: [] as string[], productIds: [] as string[], voucherIds: [] as string[], categoryId: 0 };
  // Bắt email thay vì gửi SMTP thật → đọc được link đặt lại mật khẩu trong test
  const outbox: MailMessage[] = [];
  const fakeMail = { enabled: true, send: async (m: MailMessage) => (outbox.push(m), true) };

  let adminToken: string;
  let aliceToken: string;
  let bobToken: string;
  let productId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  // Đặt hàng: cả giỏ, địa chỉ mặc định, COD (mọi con số server tự tính)
  const shipping = {};
  /** Địa chỉ giao hàng chuẩn 2 cấp: TP. Hồ Chí Minh (79) – Phường Bến Thành (26743), cùng tỉnh với kho */
  const addAddress = (token: string) =>
    http().post('/api/account/addresses').set(auth(token)).send({ fullName: 'Khách E2E', phone: '0901234567', provinceCode: 79, wardCode: 26743, street: '123 Lê Lợi' }).expect(201);

  async function register(name: string): Promise<{ token: string; id: string }> {
    const res = await http()
      .post('/api/auth/register')
      .send({ email: `${name}-${run}@e2e.test`, password, fullName: `E2E ${name}` })
      .expect(201);
    created.userIds.push(res.body.user.id);
    return { token: res.body.accessToken, id: res.body.user.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue(fakeMail).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
    configureApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaService);

    const category = await prisma.category.create({ data: { name: `E2E ${run}`, slug: `e2e-${run}` } });
    created.categoryId = category.id;

    const admin = await prisma.user.create({
      data: { email: `admin-${run}@e2e.test`, fullName: 'E2E Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(password, 4) },
    });
    created.userIds.push(admin.id);
    adminToken = (await http().post('/api/auth/login').send({ email: admin.email, password }).expect(200)).body.accessToken;

    aliceToken = (await register('alice')).token;
    bobToken = (await register('bob')).token;
    await addAddress(aliceToken);
    await addAddress(bobToken);
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.order.deleteMany({ where: { userId: { in: created.userIds } } });
      await prisma.voucher.deleteMany({ where: { id: { in: created.voucherIds } } });
      await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
      await prisma.category.deleteMany({ where: { OR: [{ id: created.categoryId }, { slug: { startsWith: `e2e-cat-${run}` } }] } });
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
      await prisma.newsletterSubscriber.deleteMany({ where: { email: { endsWith: `${run}@e2e.test` } } });
    }
    await app?.close();
  });

  it('GET /api/health reports database and redis up', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.body.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('errors carry a stable code alongside the message', async () => {
    const res = await http().post('/api/auth/register').send({ email: 'not-an-email', password: 'x', fullName: 'A' }).expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    const missing = await http().get('/api/products/khong-ton-tai-xyz').expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('sets security headers and request id', async () => {
    const res = await http().get('/api/health').set('X-Request-Id', `e2e-${run}`);
    expect(res.headers['x-request-id']).toBe(`e2e-${run}`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects weak passwords and unknown fields', async () => {
    await http().post('/api/auth/register').send({ email: `weak-${run}@e2e.test`, password: 'password', fullName: 'Weak' }).expect(400);
    await http()
      .post('/api/auth/register')
      .send({ email: `x-${run}@e2e.test`, password, fullName: 'X', role: 'ADMIN' })
      .expect(400);
  });

  it('forbids customers from admin endpoints', async () => {
    await http().get('/api/admin/stats').set(auth(aliceToken)).expect(403);
    await http().get('/api/admin/stats').expect(401);
  });

  it('admin creates a product with stock 1 and it is searchable', async () => {
    const res = await http()
      .post('/api/products')
      .set(auth(adminToken))
      .send({
        name: `Ấm siêu tốc E2E ${run}`,
        slug: `am-sieu-toc-e2e-${run}`,
        description: 'Sản phẩm kiểm thử e2e',
        price: '450000',
        stock: 1,
        categoryId: created.categoryId,
      })
      .expect(201);
    productId = res.body.id;
    created.productIds.push(productId);
    expect(res.body.price).toBe(450000);
    expect(res.body.category.slug).toBe(`e2e-${run}`);

    const search = await http().get('/api/products').query({ q: `e2e ${run}` }).expect(200);
    expect(search.body.items.map((p: { id: string }) => p.id)).toContain(productId);
  });

  it('two customers buying the last item at the same time → exactly one succeeds (no oversell)', async () => {
    for (const token of [aliceToken, bobToken]) {
      await http().put('/api/cart/items').set(auth(token)).send({ productId, quantity: 1 }).expect(200);
    }

    const results = await Promise.all(
      [aliceToken, bobToken].map((token) =>
        http().post('/api/orders').set(auth(token)).set('Idempotency-Key', randomUUID()).send(shipping),
      ),
    );

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.stock).toBe(0);
  });

  it('replaying the same Idempotency-Key returns the same order instead of creating a new one', async () => {
    await prisma.product.update({ where: { id: productId }, data: { stock: 5 } });
    await http().put('/api/cart/items').set(auth(aliceToken)).send({ productId, quantity: 2 }).expect(200);
    const key = randomUUID();

    const first = await http().post('/api/orders').set(auth(aliceToken)).set('Idempotency-Key', key).send(shipping).expect(201);
    const replay = await http().post('/api/orders').set(auth(aliceToken)).set('Idempotency-Key', key).send(shipping).expect(201);

    expect(replay.body.id).toBe(first.body.id);
    expect(first.body.items[0].product.name).toContain('E2E');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(3);
  });

  it('requires a valid Idempotency-Key', async () => {
    await http().post('/api/orders').set(auth(aliceToken)).send(shipping).expect(400);
    await http().post('/api/orders').set(auth(aliceToken)).set('Idempotency-Key', 'abc').send(shipping).expect(400);
  });

  it('customer cancels a pending order → stock is restored', async () => {
    const orders = await http().get('/api/orders').set(auth(aliceToken)).expect(200);
    const pending = orders.body.find((o: { status: string; items: { quantity: number }[] }) => o.status === 'PENDING' && o.items[0].quantity === 2);
    const before = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

    const res = await http()
      .post(`/api/orders/${pending.id}/cancel`)
      .set(auth(aliceToken))
      .send({ reason: 'Muốn thay đổi địa chỉ giao hàng' })
      .expect(200);

    expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Muốn thay đổi địa chỉ giao hàng', cancelledBy: 'CUSTOMER' });
    // Timeline: Đặt hàng → Đã hủy (kèm lý do)
    expect(res.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PENDING', 'CANCELLED']);
    expect(res.body.history[1]).toMatchObject({ actorType: 'CUSTOMER', note: 'Muốn thay đổi địa chỉ giao hàng' });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(before + 2);
    const again = await http().post(`/api/orders/${pending.id}/cancel`).set(auth(aliceToken)).expect(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');

    const tab = await http().get('/api/orders').query({ tab: 'cancelled' }).set(auth(aliceToken)).expect(200);
    expect(tab.body.every((o: { status: string }) => o.status === 'CANCELLED')).toBe(true);
    await http().get('/api/orders').query({ tab: 'khong-co' }).set(auth(aliceToken)).expect(400);
  });

  it('customers cannot read other customers orders', async () => {
    const aliceOrders = await http().get('/api/orders').set(auth(aliceToken)).expect(200);
    await http().get(`/api/orders/${aliceOrders.body[0].id}`).set(auth(bobToken)).expect(404);
  });

  it('admin moves an order through its lifecycle and invalid transitions are rejected', async () => {
    await http().put('/api/cart/items').set(auth(aliceToken)).send({ productId, quantity: 1 }).expect(200);
    const placed = await http().post('/api/orders').set(auth(aliceToken)).set('Idempotency-Key', randomUUID()).send(shipping).expect(201);
    const list = await http().get('/api/admin/orders').query({ status: 'PENDING' }).set(auth(adminToken)).expect(200);
    const order = list.body.items.find((o: { id: string }) => o.id === placed.body.id);
    expect(order).toBeDefined();

    // Admin không được nhảy cóc Chờ xác nhận → Đang giao
    const skip = await http().patch(`/api/admin/orders/${order.id}/status`).set(auth(adminToken)).send({ status: 'SHIPPING' }).expect(409);
    expect(skip.body.code).toBe('INVALID_TRANSITION');
    // Khách không tự hủy được khi shop đã chuẩn bị hàng
    await http().patch(`/api/admin/orders/${order.id}/status`).set(auth(adminToken)).send({ status: 'PROCESSING' }).expect(200);
    await http().post(`/api/orders/${order.id}/cancel`).set(auth(aliceToken)).expect(409);

    for (const status of ['SHIPPING', 'DELIVERED']) {
      const res = await http().patch(`/api/admin/orders/${order.id}/status`).set(auth(adminToken)).send({ status, note: `bước ${status}` }).expect(200);
      expect(res.body.status).toBe(status);
    }
    const delivered = await http().get(`/api/orders/${order.id}`).set(auth(aliceToken)).expect(200);
    // COD: tiền được thu khi giao
    expect(delivered.body).toMatchObject({ paymentMethod: 'COD', paymentStatus: 'PAID', deliveredAt: expect.any(String) });

    // Khách bấm "Đã nhận hàng"
    const received = await http().post(`/api/orders/${order.id}/received`).set(auth(aliceToken)).expect(200);
    expect(received.body.status).toBe('COMPLETED');
    expect(received.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PENDING', 'PROCESSING', 'SHIPPING', 'DELIVERED', 'COMPLETED']);
    await http().patch(`/api/admin/orders/${order.id}/status`).set(auth(adminToken)).send({ status: 'CANCELLED' }).expect(409);

    // "Mua lại" thêm sản phẩm vào giỏ
    await http().delete('/api/cart').set(auth(aliceToken)).expect(204);
    const again = await http().post(`/api/orders/${order.id}/buy-again`).set(auth(aliceToken)).expect(200);
    expect(again.body).toEqual({ added: 1, skipped: [] });
    expect((await http().get('/api/cart').set(auth(aliceToken)).expect(200)).body.items[0].productId).toBe(productId);
    await http().delete('/api/cart').set(auth(aliceToken)).expect(204);
    await http().post(`/api/orders/${order.id}/buy-again`).set(auth(bobToken)).expect(404);

    const stats = await http().get('/api/admin/stats').set(auth(adminToken)).expect(200);
    expect(stats.body.revenueDaily).toHaveLength(30);
    expect(Number(stats.body.kpis.revenueAll)).toBeGreaterThan(0);
    expect(Number(stats.body.kpis.revenueToday)).toBeGreaterThan(0);
    expect(stats.body.revenueByCategory.some((c: { slug: string }) => c.slug === `e2e-${run}`)).toBe(true);
    expect(stats.body.recentOrders.length).toBeGreaterThan(0);
  });

  it('delivered orders auto-complete after N days (background job)', async () => {
    await http().put('/api/cart/items').set(auth(bobToken)).send({ productId, quantity: 1 }).expect(200);
    const placed = await http().post('/api/orders').set(auth(bobToken)).set('Idempotency-Key', randomUUID()).send(shipping).expect(201);
    for (const status of ['PROCESSING', 'SHIPPING', 'DELIVERED']) {
      await http().patch(`/api/admin/orders/${placed.body.id}/status`).set(auth(adminToken)).send({ status }).expect(200);
    }
    const jobs = app.get(OrderJobsService);
    // Mới giao: chưa tới hạn
    await jobs.runAutoComplete();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } })).status).toBe('DELIVERED');

    await prisma.order.update({ where: { id: placed.body.id }, data: { deliveredAt: new Date(Date.now() - (jobs.autoCompleteDays + 1) * 86_400_000) } });
    await jobs.runAutoComplete();
    const done = await http().get(`/api/orders/${placed.body.id}`).set(auth(bobToken)).expect(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.history.at(-1)).toMatchObject({ toStatus: 'COMPLETED', actorType: 'SYSTEM' });
  });

  it('logout revokes the token immediately', async () => {
    const { token } = await register('carol');
    await http().get('/api/auth/me').set(auth(token)).expect(200);
    await http().post('/api/auth/logout').set(auth(token)).expect(204);
    await http().get('/api/auth/me').set(auth(token)).expect(401);
  });

  it('locks the account after 5 failed logins', async () => {
    const email = `alice-${run}@e2e.test`;
    for (let i = 0; i < 5; i++) {
      await http().post('/api/auth/login').send({ email, password: 'WrongPass1' }).expect(401);
    }
    await http().post('/api/auth/login').send({ email, password }).expect(429);
  });

  it('tracks units sold through order create/cancel (best-seller data is real)', async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    // 1 (đơn mua đồng thời) + 2 (đơn idempotent) − 2 (đơn bị hủy) + 1 (đơn đi hết vòng đời) + 1 (đơn tự hoàn thành) = 3
    expect(product.soldCount).toBe(3);
  });

  it('sale pricing: compare-at price must be higher and discount is computed', async () => {
    await http().patch(`/api/products/${productId}`).set(auth(adminToken)).send({ compareAtPrice: '400000' }).expect(400);
    const res = await http().patch(`/api/products/${productId}`).set(auth(adminToken)).send({ compareAtPrice: '500000' }).expect(200);
    expect(res.body.discountPercent).toBe(10);

    const onSale = await http().get('/api/products').query({ category: `e2e-${run}`, onSale: 'true' }).expect(200);
    expect(onSale.body.items.map((p: { id: string }) => p.id)).toEqual([productId]);
    await http().get('/api/products/deals').expect(200);
    await http().get('/api/products/best-sellers').expect(200);
  });

  describe('reviews', () => {
    const slug = () => `am-sieu-toc-e2e-${run}`;
    let erinToken: string;

    beforeAll(async () => {
      erinToken = (await register('erin')).token;
    });

    it('anyone signed in can review; validation and auth are enforced', async () => {
      await http().put(`/api/products/${slug()}/reviews`).send({ rating: 5, comment: 'Rất tốt, đáng tiền.' }).expect(401);
      await http().put(`/api/products/${slug()}/reviews`).set(auth(erinToken)).send({ rating: 6, comment: 'Rất tốt, đáng tiền.' }).expect(400);
      await http().put(`/api/products/${slug()}/reviews`).set(auth(erinToken)).send({ rating: 5, comment: 'ngắn' }).expect(400);

      const erin = await http()
        .put(`/api/products/${slug()}/reviews`)
        .set(auth(erinToken))
        .send({ rating: 4, comment: 'Đun nước nhanh, thiết kế đẹp.' })
        .expect(200);
      expect(erin.body.verifiedPurchase).toBe(false);
      await http()
        .put(`/api/products/${slug()}/reviews`)
        .set(auth(aliceToken))
        .send({ rating: 5, comment: 'Mua lần hai rồi, rất hài lòng!' })
        .expect(200);

      const list = await http().get(`/api/products/${slug()}/reviews`).expect(200);
      expect(list.body.summary).toMatchObject({ count: 2, average: 4.5 });
      expect(list.body.items[0].user).not.toHaveProperty('email');
      expect((await http().get(`/api/products/${slug()}`).expect(200)).body).toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });
    });

    it('a user has one review per product: re-submitting updates it, and it can be deleted', async () => {
      await http()
        .put(`/api/products/${slug()}/reviews`)
        .set(auth(erinToken))
        .send({ rating: 2, comment: 'Sau một tuần thì nắp hơi lỏng.' })
        .expect(200);
      let list = await http().get(`/api/products/${slug()}/reviews`).expect(200);
      expect(list.body.summary).toMatchObject({ count: 2, average: 3.5 });

      const mine = await http().get(`/api/products/${slug()}/reviews/mine`).set(auth(erinToken)).expect(200);
      expect(mine.body.review.rating).toBe(2);

      await http().delete(`/api/products/${slug()}/reviews/mine`).set(auth(erinToken)).expect(204);
      list = await http().get(`/api/products/${slug()}/reviews`).expect(200);
      expect(list.body.summary).toMatchObject({ count: 1, average: 5 });
    });

    it('admins can moderate reviews; customers cannot', async () => {
      const list = await http().get(`/api/products/${slug()}/reviews`).expect(200);
      const id = list.body.items[0].id;
      await http().delete(`/api/admin/reviews/${id}`).set(auth(aliceToken)).expect(403);
      await http().delete(`/api/admin/reviews/${id}`).set(auth(adminToken)).expect(204);
      expect((await http().get(`/api/products/${slug()}`).expect(200)).body).toMatchObject({ ratingAvg: 0, ratingCount: 0 });
    });
  });

  describe('password reset & change', () => {
    let dave: { token: string; id: string };
    const email = () => `dave-${run}@e2e.test`;

    beforeAll(async () => {
      dave = await register('dave');
    });

    it('does not reveal whether an email exists', async () => {
      const before = outbox.length;
      const res = await http().post('/api/auth/forgot-password').send({ email: `nobody-${run}@e2e.test` }).expect(200);
      expect(res.body).toEqual({ ok: true });
      expect(outbox.length).toBe(before);
    });

    it('emails a single-use link; resetting logs out old sessions', async () => {
      await http().post('/api/auth/forgot-password').send({ email: email() }).expect(200);
      const mail = outbox.filter((m) => m.to === email()).pop()!;
      const token = /token=([A-Za-z0-9_-]+)/.exec(mail.text)![1];

      await http().post('/api/auth/reset-password').send({ token, password: 'weak' }).expect(400);
      // iat tính theo giây: chờ sang giây mới để chắc chắn token cũ được cấp TRƯỚC mốc đổi mật khẩu
      await new Promise((r) => setTimeout(r, 1100));
      await http().post('/api/auth/reset-password').send({ token, password: 'NewPass456' }).expect(200);
      await http().post('/api/auth/reset-password').send({ token, password: 'Another789' }).expect(400);

      await http().get('/api/auth/me').set(auth(dave.token)).expect(401);
      await http().post('/api/auth/login').send({ email: email(), password }).expect(401);
      const login = await http().post('/api/auth/login').send({ email: email(), password: 'NewPass456' }).expect(200);
      dave.token = login.body.accessToken;
      expect(outbox.some((m) => m.to === email() && m.subject.includes('thay đổi'))).toBe(true);
    });

    it('change password requires the current one and keeps the current session', async () => {
      await http()
        .post('/api/auth/change-password')
        .set(auth(dave.token))
        .send({ currentPassword: 'Wrong999x', newPassword: 'Changed123' })
        .expect(400);
      await new Promise((r) => setTimeout(r, 1100));
      const res = await http()
        .post('/api/auth/change-password')
        .set(auth(dave.token))
        .send({ currentPassword: 'NewPass456', newPassword: 'Changed123' })
        .expect(200);
      await http().get('/api/auth/me').set(auth(dave.token)).expect(401);
      const me = await http().get('/api/auth/me').set(auth(res.body.accessToken)).expect(200);
      expect(me.body).toMatchObject({ email: email(), hasPassword: true, providers: [] });
    });
  });

  describe('social login (not configured in CI)', () => {
    it('advertises no providers and redirects back with a friendly error', async () => {
      expect((await http().get('/api/auth/oauth/providers').expect(200)).body).toEqual({ google: false, facebook: false });
      const res = await http().get('/api/auth/oauth/google').expect(302);
      expect(res.headers.location).toMatch(/\/login\?oauth_error=not_configured$/);
      expect((await http().get('/api/auth/oauth/twitter').expect(302)).headers.location).toMatch(/oauth_error=unknown_provider/);
    });

    it('rejects unknown or malformed login codes', async () => {
      await http().post('/api/auth/oauth/exchange').send({ code: 'x'.repeat(43) }).expect(401);
      await http().post('/api/auth/oauth/exchange').send({ code: '../../etc' }).expect(400);
    });
  });

  describe('vouchers (kho voucher, ví, quản trị)', () => {
    const code = `E2E${run.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
    const window = () => ({ startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() });

    it('admin creates vouchers; invalid configs and duplicate codes are rejected', async () => {
      await http().post('/api/admin/vouchers').set(auth(aliceToken)).send({ code, name: 'x', type: 'FIXED', value: 1, ...window() }).expect(403);
      await http().post('/api/admin/vouchers').set(auth(adminToken)).send({ code, name: 'Sai %', type: 'PERCENT', value: 150, ...window() }).expect(400);
      await http()
        .post('/api/admin/vouchers')
        .set(auth(adminToken))
        .send({ code, name: 'Sai thời gian', type: 'FIXED', value: 1000, startsAt: window().endsAt, endsAt: window().startsAt })
        .expect(400);
      const res = await http()
        .post('/api/admin/vouchers')
        .set(auth(adminToken))
        .send({ code: code.toLowerCase(), name: 'E2E giảm 10%', type: 'PERCENT', value: 10, maxDiscount: 20000, minOrderValue: 100000, usageLimit: 1, ...window() })
        .expect(201);
      expect(res.body).toMatchObject({ code, usedCount: 0, isActive: true });
      created.voucherIds.push(res.body.id);
      await http().post('/api/admin/vouchers').set(auth(adminToken)).send({ code, name: 'Trùng', type: 'FIXED', value: 1000, ...window() }).expect(409);
    });

    it('customers browse public vouchers and save them to their wallet (idempotent)', async () => {
      const list = await http().get('/api/vouchers').expect(200);
      const mine = list.body.find((v: { code: string }) => v.code === code);
      expect(mine).toMatchObject({ summary: 'Giảm 10% tối đa 20.000₫ · Đơn từ 100.000₫', usedPercent: 0 });
      expect(mine.usedCount).toBeUndefined();

      await http().post('/api/vouchers/save').set(auth(bobToken)).send({ code: code.toLowerCase() }).expect(200);
      await http().post('/api/vouchers/save').set(auth(bobToken)).send({ code }).expect(200);
      const wallet = await http().get('/api/vouchers/wallet').set(auth(bobToken)).expect(200);
      expect(wallet.body.filter((v: { code: string }) => v.code === code)).toHaveLength(1);
      const flagged = await http().get('/api/vouchers/mine').set(auth(bobToken)).expect(200);
      expect(flagged.body.find((v: { code: string }) => v.code === code).saved).toBe(true);

      const missing = await http().post('/api/vouchers/save').set(auth(bobToken)).send({ code: 'KHONGCOMANAY' }).expect(404);
      expect(missing.body.code).toBe('VOUCHER_NOT_FOUND');
    });
  });

  describe('checkout (xem trước đơn, voucher, giá thay đổi, mua một phần giỏ, mua ngay)', () => {
    const code = `E2E${run.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
    const shipCode = `SHIP${run.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
    let extraId: string;
    const buyNow = (quantity = 1) => ({ items: [{ productId, quantity }] });

    beforeAll(async () => {
      // Sản phẩm chính 450.000₫, nặng 500 g, hộp 20×20×15 cm (quy đổi 1 kg) → nội tỉnh HCM: 20.000₫
      await prisma.product.update({ where: { id: productId }, data: { stock: 20, weightGrams: 500, lengthCm: 20, widthCm: 20, heightCm: 15 } });
      const extra = await http()
        .post('/api/products')
        .set(auth(adminToken))
        .send({ name: `Khăn E2E ${run}`, slug: `khan-e2e-${run}`, description: 'x', price: 100000, stock: 10, categoryId: created.categoryId })
        .expect(201);
      extraId = extra.body.id;
      created.productIds.push(extraId);
      const ship = await http()
        .post('/api/admin/vouchers')
        .set(auth(adminToken))
        .send({ code: shipCode, name: 'Freeship E2E', type: 'FREESHIP', value: 0, startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 86_400_000) })
        .expect(201);
      created.voucherIds.push(ship.body.id);
    });

    it('preview recomputes everything server-side: subtotal, shipping, ETA, vouchers with reasons', async () => {
      const res = await http().post('/api/checkout/preview').set(auth(aliceToken)).send(buyNow()).expect(200);
      expect(res.body).toMatchObject({
        source: 'BUY_NOW',
        canPlaceOrder: true,
        paymentMethod: 'COD',
        address: { provinceCode: 79, wardCode: 26743 },
        shipping: { fee: 20000, provider: 'TABLE', freeShipEligible: false, amountToFreeShip: 50000, estimatedDelivery: { from: expect.any(String), to: expect.any(String) } },
        pricing: { subtotal: 450000, shippingFee: 20000, discount: 0, shippingDiscount: 0, total: 470000 },
      });
      expect(res.body.vouchers.discount.find((v: { code: string }) => v.code === code)).toMatchObject({ applicable: true, discount: 20000 });
      expect(res.body.vouchers.shipping.find((v: { code: string }) => v.code === shipCode)).toMatchObject({ applicable: true, discount: 20000 });

      // 1 voucher giảm giá + 1 voucher vận chuyển cùng lúc
      const both = await http().post('/api/checkout/preview').set(auth(aliceToken)).send({ ...buyNow(), voucherCode: code, shippingVoucherCode: shipCode }).expect(200);
      expect(both.body.pricing).toEqual({ subtotal: 450000, shippingFee: 20000, discount: 20000, shippingDiscount: 20000, total: 430000, saved: 40000 });

      // Mua 2 (quy đổi 2 kg → 26.000₫): vượt ngưỡng 500.000₫ → miễn phí vận chuyển, voucher freeship không còn tác dụng
      const two = await http().post('/api/checkout/preview').set(auth(aliceToken)).send({ ...buyNow(2), shippingVoucherCode: shipCode }).expect(200);
      expect(two.body.pricing).toMatchObject({ shippingFee: 26000, shippingDiscount: 26000, total: 900000 });
      expect(two.body.vouchers.errors).toEqual([{ code: shipCode, reason: 'Đơn hàng đã được miễn phí vận chuyển' }]);

      // Chọn nhầm ô voucher → báo lý do, không tính giảm, không đặt được
      const wrong = await http().post('/api/checkout/preview').set(auth(aliceToken)).send({ ...buyNow(), shippingVoucherCode: code }).expect(200);
      expect(wrong.body.canPlaceOrder).toBe(false);
      expect(wrong.body.vouchers.errors[0].reason).toBe('Đây không phải voucher vận chuyển');
      const tooMany = await http().post('/api/checkout/preview').set(auth(aliceToken)).send(buyNow(30)).expect(200);
      expect(tooMany.body.issues[0]).toMatchObject({ code: 'OUT_OF_STOCK', productId });
    });

    it('refuses to place the order when the price changed since the customer looked (PRICE_CHANGED)', async () => {
      const preview = await http().post('/api/checkout/preview').set(auth(aliceToken)).send(buyNow()).expect(200);
      await http().patch(`/api/products/${productId}`).set(auth(adminToken)).send({ price: 460000, compareAtPrice: null }).expect(200);

      const res = await http()
        .post('/api/orders')
        .set(auth(aliceToken))
        .set('Idempotency-Key', randomUUID())
        .send({ ...buyNow(), expectedTotal: preview.body.pricing.total })
        .expect(409);
      expect(res.body).toMatchObject({ code: 'PRICE_CHANGED', details: { expectedTotal: 470000, total: 480000 } });
      expect(res.body.details.preview.items[0].unitPrice).toBe(460000);
      await http().patch(`/api/products/${productId}`).set(auth(adminToken)).send({ price: 450000 }).expect(200);
    });

    it('a voucher with 1 use left, two customers at once → exactly one gets it; cancelling returns the use', async () => {
      const results = await Promise.all(
        [aliceToken, bobToken].map((token) =>
          http().post('/api/orders').set(auth(token)).set('Idempotency-Key', randomUUID()).send({ ...buyNow(), voucherCode: code }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(['VOUCHER_EXHAUSTED', 'VOUCHER_NOT_APPLICABLE']).toContain(loser.body.code);
      const winner = results.find((r) => r.status === 201)!;
      expect(winner.body).toMatchObject({ voucherCode: code, discountAmount: 20000, totalAmount: 450000, subtotal: 450000, shippingFee: 20000 });
      expect((await prisma.voucher.findUniqueOrThrow({ where: { code } })).usedCount).toBe(1);

      const token = winner.request.getHeader('Authorization') as string;
      await http().post(`/api/orders/${winner.body.id}/cancel`).set('Authorization', token).send({ reason: 'Muốn nhập/thay đổi mã voucher' }).expect(200);
      expect((await prisma.voucher.findUniqueOrThrow({ where: { code } })).usedCount).toBe(0);
      expect(await prisma.voucherUsage.count({ where: { orderId: winner.body.id } })).toBe(0);
    });

    it('buys only the ticked cart items; "buy now" leaves the cart untouched', async () => {
      await http().delete('/api/cart').set(auth(bobToken)).expect(204);
      await http().put('/api/cart/items').set(auth(bobToken)).send({ productId, quantity: 1 }).expect(200);
      await http().put('/api/cart/items').set(auth(bobToken)).send({ productId: extraId, quantity: 2 }).expect(200);

      const order = await http().post('/api/orders').set(auth(bobToken)).set('Idempotency-Key', randomUUID()).send({ cartProductIds: [extraId] }).expect(201);
      expect(order.body.items.map((i: { productId: string; quantity: number }) => [i.productId, i.quantity])).toEqual([[extraId, 2]]);
      expect(order.body.items[0]).toMatchObject({ productName: `Khăn E2E ${run}`, unitPrice: 100000 });
      let cart = (await http().get('/api/cart').set(auth(bobToken)).expect(200)).body;
      expect(cart.items.map((i: { productId: string }) => i.productId)).toEqual([productId]);

      // Chọn sản phẩm không có trong giỏ
      const gone = await http().post('/api/checkout/preview').set(auth(bobToken)).send({ cartProductIds: [extraId] }).expect(409);
      expect(gone.body.code).toBe('NO_ITEMS_SELECTED');

      await http().post('/api/orders').set(auth(bobToken)).set('Idempotency-Key', randomUUID()).send({ items: [{ productId: extraId, quantity: 1 }] }).expect(201);
      cart = (await http().get('/api/cart').set(auth(bobToken)).expect(200)).body;
      expect(cart.items.map((i: { productId: string }) => i.productId)).toEqual([productId]);
      await http().delete('/api/cart').set(auth(bobToken)).expect(204);
    });

    it('validates checkout input and ownership', async () => {
      await http().post('/api/checkout/preview').set(auth(aliceToken)).send({ items: [{ productId, quantity: 0 }] }).expect(400);
      await http().post('/api/checkout/preview').set(auth(aliceToken)).send({ ...buyNow(), cartProductIds: [productId] }).expect(400);
      const other = await http().get('/api/account/addresses').set(auth(bobToken)).expect(200);
      const res = await http().post('/api/checkout/preview').set(auth(aliceToken)).send({ ...buyNow(), addressId: other.body[0].id }).expect(404);
      expect(res.body.code).toBe('ADDRESS_NOT_FOUND');
      await http().post('/api/checkout/preview').send(buyNow()).expect(401);
    });
  });

  describe('online payments (VNPay/MoMo qua cổng giả lập, IPN, hết hạn, hoàn tiền)', () => {
    const buyNow = (paymentMethod: string) => ({ items: [{ productId, quantity: 1 }], paymentMethod });
    const place = async (token: string, paymentMethod: string) =>
      (await http().post('/api/orders').set(auth(token)).set('Idempotency-Key', randomUUID()).send(buyNow(paymentMethod)).expect(201)).body;
    const pay = async (token: string, orderId: string, method?: string) =>
      (await http().post(`/api/orders/${orderId}/payments`).set(auth(token)).send(method ? { method } : {}).expect(200)).body;
    /** Giả lập server cổng gọi IPN về: lấy chữ ký từ link thanh toán server đã cấp */
    const notify = (payUrl: string, result: 'success' | 'failed', amount?: number) => {
      const q = new URL(payUrl).searchParams;
      return http()
        .post('/api/payments/mock/notify')
        .send({ method: q.get('method'), txnRef: q.get('ref'), amount: amount ?? Number(q.get('amount')), result, sig: q.get('sig') });
    };

    beforeAll(async () => {
      await prisma.product.update({ where: { id: productId }, data: { stock: 30, price: 450000 } });
    });

    it('lists payment methods; VietQR stays unavailable until bank details are configured', async () => {
      const res = await http().get('/api/payments/methods').expect(200);
      expect(res.body.map((m: { method: string; available: boolean }) => [m.method, m.available])).toEqual([
        ['COD', true],
        ['VNPAY', true],
        ['MOMO', true],
        ['VIETQR', false],
      ]);
      const placed = await http().post('/api/orders').set(auth(aliceToken)).set('Idempotency-Key', randomUUID()).send(buyNow('VIETQR')).expect(400);
      expect(placed.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    });

    it('VNPay: awaiting payment, signed link, rejects bad signature / amount, confirms once via IPN', async () => {
      const order = await place(aliceToken, 'VNPAY');
      expect(order).toMatchObject({ status: 'AWAITING_PAYMENT', paymentMethod: 'VNPAY', paymentStatus: 'UNPAID', paymentExpiresAt: expect.any(String) });

      const payment = await pay(aliceToken, order.id);
      expect(payment).toMatchObject({ method: 'VNPAY', amount: order.totalAmount, status: 'PENDING', sandbox: true });
      expect(payment.payUrl).toMatch(/\/payment\/mock\?/);
      // Bấm "Thanh toán" lần nữa → cùng giao dịch, không tạo link mới
      expect((await pay(aliceToken, order.id)).id).toBe(payment.id);
      await http().post(`/api/orders/${order.id}/payments`).set(auth(bobToken)).send({}).expect(404);

      // Chữ ký sai (giả mạo IPN)
      const q = new URL(payment.payUrl).searchParams;
      await http().post('/api/payments/mock/notify').send({ method: 'VNPAY', txnRef: q.get('ref'), amount: order.totalAmount, result: 'success', sig: 'f'.repeat(64) }).expect(400);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('AWAITING_PAYMENT');

      // Số tiền không khớp → từ chối, đơn vẫn chờ thanh toán (chữ ký sai vì số tiền là 1 phần chữ ký)
      await notify(payment.payUrl, 'success', 1000).expect(400);

      // Thanh toán thành công
      const ok = await notify(payment.payUrl, 'success').expect(200);
      expect(ok.body).toEqual({ result: 'ok' });
      const paid = await http().get(`/api/orders/${order.id}`).set(auth(aliceToken)).expect(200);
      expect(paid.body).toMatchObject({ status: 'PENDING', paymentStatus: 'PAID', paidAt: expect.any(String), paymentExpiresAt: null });
      expect(paid.body.history.at(-1)).toMatchObject({ fromStatus: 'AWAITING_PAYMENT', toStatus: 'PENDING', actorType: 'SYSTEM', note: 'Thanh toán thành công qua VNPay' });

      // Cổng gọi lại IPN nhiều lần → chỉ xử lý 1 lần
      const again = await notify(payment.payUrl, 'success').expect(200);
      expect(again.body).toEqual({ result: 'duplicate' });
      const events = await prisma.paymentEvent.findMany({ where: { paymentId: payment.id }, orderBy: { id: 'asc' } });
      expect(events.map((e) => e.result)).toEqual(['invalid_signature', 'invalid_signature', 'processed', 'duplicate']);
      await http().post(`/api/orders/${order.id}/payments`).set(auth(aliceToken)).send({}).expect(409);
    });

    it('failed payment can be retried, and the customer can switch to MoMo or to COD', async () => {
      const order = await place(bobToken, 'VNPAY');
      const first = await pay(bobToken, order.id);
      await notify(first.payUrl, 'failed').expect(200);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('FAILED');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('AWAITING_PAYMENT');

      // Thanh toán lại bằng MoMo: giao dịch mới
      const momo = await pay(bobToken, order.id, 'MOMO');
      expect(momo).toMatchObject({ method: 'MOMO', status: 'PENDING' });
      expect(momo.id).not.toBe(first.id);

      // Đổi sang COD: không cần trả trước, đơn sang Chờ xác nhận, link MoMo bị đóng
      const cod = await http().post(`/api/orders/${order.id}/payments`).set(auth(bobToken)).send({ method: 'COD' }).expect(200);
      expect(cod.body).toEqual({});
      const after = await http().get(`/api/orders/${order.id}`).set(auth(bobToken)).expect(200);
      expect(after.body).toMatchObject({ status: 'PENDING', paymentMethod: 'COD', paymentExpiresAt: null });
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: momo.id } })).status).toBe('CANCELLED');
      // Link cũ đã đóng: IPN thành công đến muộn → ghi nhận và tự hoàn tiền
      await notify(momo.payUrl, 'success').expect(200);
      expect(await prisma.refund.findFirst({ where: { paymentId: momo.id } })).toMatchObject({ status: 'SUCCEEDED', amount: order.totalAmount });
    });

    it('unpaid orders are cancelled after the hold window: stock and voucher come back; a late IPN is refunded', async () => {
      const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;
      const order = await place(aliceToken, 'MOMO');
      const payment = await pay(aliceToken, order.id);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(stockBefore - 1);

      await prisma.order.update({ where: { id: order.id }, data: { paymentExpiresAt: new Date(Date.now() - 1000) } });
      await http().post(`/api/orders/${order.id}/payments`).set(auth(aliceToken)).send({}).expect(409);
      expect(await app.get(PaymentJobsService).runExpire()).toBeGreaterThanOrEqual(1);

      const cancelled = await http().get(`/api/orders/${order.id}`).set(auth(aliceToken)).expect(200);
      expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelledBy: 'SYSTEM', cancelReason: 'Quá hạn thanh toán, đơn được hủy tự động' });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(stockBefore);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('EXPIRED');

      // Khách vẫn kịp trả tiền ở cổng → IPN đến sau khi đơn đã hủy → hoàn tiền tự động
      await notify(payment.payUrl, 'success').expect(200);
      const refunded = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { refunds: true } });
      expect(refunded.paymentStatus).toBe('REFUNDED');
      expect(refunded.refunds).toEqual([expect.objectContaining({ status: 'SUCCEEDED', amount: order.totalAmount })]);
    });

    it('cancelling a paid order refunds through the gateway; admins see payments, raw IPN events and refunds', async () => {
      const order = await place(bobToken, 'VNPAY');
      const payment = await pay(bobToken, order.id);
      await notify(payment.payUrl, 'success').expect(200);

      const res = await http().post(`/api/orders/${order.id}/cancel`).set(auth(bobToken)).send({ reason: 'Đổi ý, không muốn mua nữa' }).expect(200);
      expect(res.body.status).toBe('CANCELLED');
      const final = await http().get(`/api/orders/${order.id}`).set(auth(bobToken)).expect(200);
      expect(final.body.paymentStatus).toBe('REFUNDED');

      const admin = await http().get(`/api/admin/orders/${order.id}/payments`).set(auth(adminToken)).expect(200);
      expect(admin.body[0]).toMatchObject({ status: 'SUCCEEDED', refunds: [expect.objectContaining({ status: 'SUCCEEDED' })] });
      expect(admin.body[0].events[0]).toMatchObject({ kind: 'IPN', result: 'processed', signatureValid: true });
      await http().get(`/api/admin/orders/${order.id}/payments`).set(auth(bobToken)).expect(403);
      const refunds = await http().get('/api/admin/refunds').query({ status: 'SUCCEEDED' }).set(auth(adminToken)).expect(200);
      expect(refunds.body.some((r: { orderId: string }) => r.orderId === order.id)).toBe(true);
    });

    it('admins can confirm a transfer manually (VietQR reconciliation path)', async () => {
      const order = await place(aliceToken, 'VNPAY');
      const payment = await pay(aliceToken, order.id);
      const res = await http().post(`/api/admin/payments/${payment.id}/confirm`).set(auth(adminToken)).send({ note: 'Đã thấy tiền trong sao kê' }).expect(200);
      expect(res.body.status).toBe('SUCCEEDED');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PAID');
      await http().post(`/api/admin/payments/${payment.id}/confirm`).set(auth(adminToken)).send({}).expect(200);
      expect(await prisma.paymentEvent.count({ where: { paymentId: payment.id, kind: 'MANUAL' } })).toBe(2);
    });
  });

  describe('returns / refunds (trả hàng, ảnh minh chứng, admin duyệt / từ chối)', () => {
    // PNG 1x1 hợp lệ
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const reason = 'Hàng bị bể vỡ, móp méo khi vận chuyển';

    /** Đơn đi tới Đã giao (COD hoặc đã thanh toán online qua cổng giả lập) */
    async function delivered(token: string, paymentMethod: 'COD' | 'VNPAY') {
      const order = (await http().post('/api/orders').set(auth(token)).set('Idempotency-Key', randomUUID()).send({ items: [{ productId, quantity: 1 }], paymentMethod }).expect(201)).body;
      if (paymentMethod === 'VNPAY') {
        const p = (await http().post(`/api/orders/${order.id}/payments`).set(auth(token)).send({}).expect(200)).body;
        const q = new URL(p.payUrl).searchParams;
        await http().post('/api/payments/mock/notify').send({ method: 'VNPAY', txnRef: q.get('ref'), amount: Number(q.get('amount')), result: 'success', sig: q.get('sig') }).expect(200);
      }
      for (const status of ['PROCESSING', 'SHIPPING', 'DELIVERED']) {
        await http().patch(`/api/admin/orders/${order.id}/status`).set(auth(adminToken)).send({ status }).expect(200);
      }
      return order;
    }
    const requestReturn = (token: string, orderId: string) =>
      http()
        .post(`/api/orders/${orderId}/return`)
        .set(auth(token))
        .field('reason', reason)
        .field('description', 'Hộp bị móp, ấm bị nứt phần đáy khi mở ra')
        .attach('images', png, { filename: 'loi.png', contentType: 'image/png' });

    beforeAll(async () => {
      await prisma.product.update({ where: { id: productId }, data: { stock: 30 } });
    });

    it('paid order: request with photo → admin approves → stock back, refunded via the gateway', async () => {
      const order = await delivered(aliceToken, 'VNPAY');
      const stock = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

      // Không phải chủ đơn / chưa giao / lý do lạ
      await requestReturn(bobToken, order.id).expect(404);
      await http().post(`/api/orders/${order.id}/return`).set(auth(aliceToken)).field('reason', 'Không thích').field('description', 'Mô tả đủ dài để qua').expect(400);

      const res = await requestReturn(aliceToken, order.id).expect(201);
      expect(res.body).toMatchObject({ status: 'REQUESTED', reason, refundAmount: order.totalAmount, images: [expect.stringMatching(/^\/api\/media\/returns\//)] });
      await http().get(res.body.images[0]).expect(200).expect('Content-Type', 'image/png');
      expect((await http().get(`/api/orders/${order.id}`).set(auth(aliceToken)).expect(200)).body.status).toBe('RETURN_REQUESTED');
      const dup = await requestReturn(aliceToken, order.id).expect(409);
      expect(dup.body.code).toBe('RETURN_NOT_ALLOWED');

      const list = await http().get('/api/admin/returns').query({ status: 'REQUESTED' }).set(auth(adminToken)).expect(200);
      expect(list.body.some((r: { id: string }) => r.id === res.body.id)).toBe(true);
      await http().post(`/api/admin/returns/${res.body.id}/approve`).set(auth(aliceToken)).send({}).expect(403);
      const ok = await http().post(`/api/admin/returns/${res.body.id}/approve`).set(auth(adminToken)).send({ note: 'Đã nhận lại hàng lỗi' }).expect(200);
      expect(ok.body.status).toBe('APPROVED');
      await http().post(`/api/admin/returns/${res.body.id}/approve`).set(auth(adminToken)).send({}).expect(409);

      const final = await http().get(`/api/orders/${order.id}`).set(auth(aliceToken)).expect(200);
      expect(final.body).toMatchObject({ status: 'RETURNED', paymentStatus: 'REFUNDED' });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(stock + 1);
    });

    it('COD order: rejection needs a reason and completes the order; approval needs a manual refund', async () => {
      const a = await delivered(bobToken, 'COD');
      const r1 = (await requestReturn(bobToken, a.id).expect(201)).body;
      await http().post(`/api/admin/returns/${r1.id}/reject`).set(auth(adminToken)).send({}).expect(400);
      const rejected = await http().post(`/api/admin/returns/${r1.id}/reject`).set(auth(adminToken)).send({ note: 'Ảnh không cho thấy lỗi sản phẩm' }).expect(200);
      expect(rejected.body.status).toBe('REJECTED');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('COMPLETED');

      const b = await delivered(bobToken, 'COD');
      const r2 = (await requestReturn(bobToken, b.id).expect(201)).body;
      await http().post(`/api/admin/returns/${r2.id}/approve`).set(auth(adminToken)).send({}).expect(200);
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: b.id } });
      expect(refund).toMatchObject({ status: 'MANUAL_REQUIRED', paymentId: null, amount: b.totalAmount });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: b.id } })).paymentStatus).toBe('REFUND_PENDING');
      await http().post(`/api/admin/refunds/${refund.id}/complete`).set(auth(adminToken)).send({ note: 'Đã chuyển khoản lại cho khách' }).expect(200);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: b.id } })).paymentStatus).toBe('REFUNDED');
    });

    it('refuses returns after the return window', async () => {
      const order = await delivered(aliceToken, 'COD');
      await prisma.order.update({ where: { id: order.id }, data: { deliveredAt: new Date(Date.now() - 40 * 86_400_000) } });
      const res = await requestReturn(aliceToken, order.id).expect(409);
      expect(res.body.code).toBe('RETURN_NOT_ALLOWED');
    });
  });

  it('lists the 34 provinces and their wards (2-level administrative units)', async () => {
    const provinces = await http().get('/api/locations/provinces').expect(200);
    expect(provinces.body).toHaveLength(34);
    expect(provinces.body.find((p: { code: number }) => p.code === 79)).toMatchObject({ name: 'Thành phố Hồ Chí Minh', region: 'SOUTH' });
    const wards = await http().get('/api/locations/provinces/48/wards').expect(200);
    expect(wards.body.some((w: { name: string }) => w.name === 'Phường Hải Châu')).toBe(true);
    await http().get('/api/locations/provinces/999/wards').expect(404);
  });

  it('newsletter subscription is idempotent and sends one welcome mail', async () => {
    const email = `news-${run}@e2e.test`;
    await http().post('/api/newsletter/subscribe').send({ email }).expect(200);
    await http().post('/api/newsletter/subscribe').send({ email: email.toUpperCase() }).expect(200);
    expect(outbox.filter((m) => m.to === email)).toHaveLength(1);
    await http().post('/api/newsletter/subscribe').send({ email: 'not-an-email' }).expect(400);
  });

  describe('my account (profile, avatar, address book)', () => {
    // Đà Nẵng (48) – Phường Hải Châu (20242), đơn vị hành chính mới (cần seed danh mục tỉnh/xã)
    const address = { fullName: 'Alice E2E', phone: '0912345678', provinceCode: 48, wardCode: 20242, street: '12 Bạch Đằng' };
    // PNG 1x1 hợp lệ (magic bytes đúng)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

    it('updates profile fields and validates them', async () => {
      const res = await http()
        .patch('/api/account/profile')
        .set(auth(aliceToken))
        .send({ fullName: 'Alice Nguyễn', phone: '0912345678', gender: 'FEMALE', dateOfBirth: '2001-09-15' })
        .expect(200);
      expect(res.body).toMatchObject({ fullName: 'Alice Nguyễn', phone: '0912345678', gender: 'FEMALE', dateOfBirth: '2001-09-15' });

      await http().patch('/api/account/profile').set(auth(aliceToken)).send({ phone: '12345' }).expect(400);
      await http().patch('/api/account/profile').set(auth(aliceToken)).send({ dateOfBirth: '2001-02-30' }).expect(400);
      await http().patch('/api/account/profile').set(auth(aliceToken)).send({ gender: 'ROBOT' }).expect(400);
      await http().patch('/api/account/profile').send({ fullName: 'Nobody' }).expect(401);

      const cleared = await http().patch('/api/account/profile').set(auth(aliceToken)).send({ phone: '' }).expect(200);
      expect(cleared.body.phone).toBeNull();
      expect(cleared.body.gender).toBe('FEMALE');
    });

    it('uploads an avatar (≤ 1 MB, real image only) and serves it', async () => {
      const res = await http().post('/api/account/avatar').set(auth(aliceToken)).attach('file', png, { filename: 'a.png', contentType: 'image/png' }).expect(201);
      expect(res.body.avatarUrl).toMatch(/^\/api\/media\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);
      await http().get(res.body.avatarUrl).expect(200).expect('Content-Type', 'image/png');

      await http()
        .post('/api/account/avatar')
        .set(auth(aliceToken))
        .attach('file', Buffer.from('not an image at all'), { filename: 'x.png', contentType: 'image/png' })
        .expect(400);
      await http()
        .post('/api/account/avatar')
        .set(auth(aliceToken))
        .attach('file', Buffer.alloc(1024 * 1024 + 1, 1), { filename: 'big.png', contentType: 'image/png' })
        .expect(413);
      await http().get('/api/media/avatars/..%2F..%2Fetc/passwd').expect(404);
    });

    it('address book: first is default, one default at a time, private per user', async () => {
      const { token: dora } = await register('dora');
      const { token: eve } = await register('eve');
      const first = await http().post('/api/account/addresses').set(auth(dora)).send(address).expect(201);
      expect(first.body).toMatchObject({ isDefault: true, province: 'Thành phố Đà Nẵng', ward: 'Phường Hải Châu', district: null, provinceCode: 48 });
      // Xã không thuộc tỉnh đã chọn (Phường Ba Đình là của Hà Nội)
      const wrong = await http().post('/api/account/addresses').set(auth(dora)).send({ ...address, wardCode: 4 }).expect(400);
      expect(wrong.body.code).toBe('ADDRESS_INVALID');

      const second = await http()
        .post('/api/account/addresses')
        .set(auth(dora))
        .send({ ...address, street: '99 Trần Phú', type: 'OFFICE', isDefault: true })
        .expect(201);
      let list = (await http().get('/api/account/addresses').set(auth(dora)).expect(200)).body;
      expect(list.filter((a: { isDefault: boolean }) => a.isDefault).map((a: { id: string }) => a.id)).toEqual([second.body.id]);

      list = (await http().post(`/api/account/addresses/${first.body.id}/default`).set(auth(dora)).expect(201)).body;
      expect(list[0].id).toBe(first.body.id);

      // Người khác không xem/sửa/xóa được địa chỉ của Dora
      expect((await http().get('/api/account/addresses').set(auth(eve)).expect(200)).body).toEqual([]);
      await http().put(`/api/account/addresses/${first.body.id}`).set(auth(eve)).send(address).expect(404);
      await http().delete(`/api/account/addresses/${first.body.id}`).set(auth(eve)).expect(404);

      await http().post('/api/account/addresses').set(auth(dora)).send({ ...address, phone: 'abc' }).expect(400);
      await http().post('/api/account/addresses').set(auth(dora)).send({ ...address, street: '<script>' }).expect(400);

      // Xóa địa chỉ mặc định → địa chỉ còn lại tự thành mặc định
      list = (await http().delete(`/api/account/addresses/${first.body.id}`).set(auth(dora)).expect(200)).body;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: second.body.id, isDefault: true });
    });
  });

  it('a customer can delete their own account: personal data removed, orders kept anonymised, sessions revoked', async () => {
    const zoe = await register('zoe');
    const email = `zoe-${run}@e2e.test`;
    await http()
      .post('/api/account/addresses')
      .set(auth(zoe.token))
      .send({ fullName: 'Zoe', phone: '0912345678', provinceCode: 46, wardCode: 19789, street: '1 Lê Lợi' })
      .expect(201);

    await http().delete('/api/account').set(auth(zoe.token)).send({ confirmEmail: 'wrong@e2e.test', password }).expect(400);
    await http().delete('/api/account').set(auth(zoe.token)).send({ confirmEmail: email, password: 'Wrong12345' }).expect(400);
    await http().delete('/api/account').set(auth(adminToken)).send({ confirmEmail: `admin-${run}@e2e.test`, password }).expect(403);

    await http().delete('/api/account').set(auth(zoe.token)).send({ confirmEmail: email, password }).expect(204);
    await http().get('/api/auth/me').set(auth(zoe.token)).expect(401);
    await http().post('/api/auth/login').send({ email, password }).expect(401);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: zoe.id }, include: { addresses: true } });
    expect(row.email).toBe(`deleted-${zoe.id}@deleted.invalid`);
    expect(row.passwordHash).toBeNull();
    expect(row.addresses).toHaveLength(0);
  });

  it('filters products by price range and exposes a public store summary', async () => {
    const inRange = await http().get('/api/products').query({ category: `e2e-${run}`, minPrice: 400000, maxPrice: 500000 }).expect(200);
    expect(inRange.body.items.map((p: { id: string }) => p.id)).toContain(productId);
    const outOfRange = await http().get('/api/products').query({ category: `e2e-${run}`, maxPrice: 400000 }).expect(200);
    expect(outOfRange.body.items.map((p: { id: string }) => p.id)).not.toContain(productId);
    await http().get('/api/products').query({ minPrice: -1 }).expect(400);

    const summary = await http().get('/api/products/summary').expect(200);
    expect(summary.body).toEqual({
      products: expect.any(Number),
      onSale: expect.any(Number),
      sold: expect.any(Number),
      reviews: expect.any(Number),
      averageRating: expect.any(Number),
      reviewers: expect.any(Number),
    });
    expect(summary.body.products).toBeGreaterThan(0);
  });

  it('media endpoint only serves server-generated paths', async () => {
    await http().get('/api/media/products/..%2F..%2Fetc/passwd').expect(404);
    await http().get(`/api/media/products/${productId}/${randomUUID()}.webp`).expect(404);
  });

  describe('admin management (users, catalog, orders, audit log)', () => {
    let carol: { token: string; id: string };
    const carolEmail = () => `mgmt-${run}@e2e.test`;
    const relogin = async () => {
      await new Promise((r) => setTimeout(r, 1100));
      return (await http().post('/api/auth/login').send({ email: carolEmail(), password }).expect(200)).body.accessToken as string;
    };

    beforeAll(async () => {
      carol = await register('mgmt');
      await addAddress(carol.token);
    });

    it('lists and searches users with counts; customers are forbidden', async () => {
      const res = await http().get(`/api/admin/users?q=${encodeURIComponent(carolEmail())}`).set(auth(adminToken)).expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).toMatchObject({ id: carol.id, role: 'CUSTOMER', orderCount: 0, totalSpent: 0 });
      expect(res.body.counts.admins).toBeGreaterThanOrEqual(1);
      await http().get('/api/admin/users').set(auth(carol.token)).expect(403);
    });

    it('locking revokes sessions and blocks login (403); unlocking restores access', async () => {
      await http().post(`/api/admin/users/${carol.id}/lock`).set(auth(adminToken)).send({ reason: 'e2e' }).expect(200);
      await http().get('/api/auth/me').set(auth(carol.token)).expect(401);
      const blocked = await http().post('/api/auth/login').send({ email: carolEmail(), password }).expect(403);
      expect(blocked.body.message).toBe('Account is locked');

      await http().post(`/api/admin/users/${carol.id}/unlock`).set(auth(adminToken)).expect(200);
      carol.token = await relogin();
    });

    it('promoting to admin forces re-login; admins cannot demote or lock themselves', async () => {
      await http().patch(`/api/admin/users/${carol.id}/role`).set(auth(adminToken)).send({ role: 'ADMIN' }).expect(200);
      await http().get('/api/auth/me').set(auth(carol.token)).expect(401);
      const carolAdmin = await relogin();
      await http().get('/api/admin/stats').set(auth(carolAdmin)).expect(200);
      await http().patch(`/api/admin/users/${carol.id}/role`).set(auth(carolAdmin)).send({ role: 'CUSTOMER' }).expect(400);
      await http().post(`/api/admin/users/${carol.id}/lock`).set(auth(carolAdmin)).send({}).expect(400);
      await http().patch(`/api/admin/users/${carol.id}/role`).set(auth(adminToken)).send({ role: 'CUSTOMER' }).expect(200);
      carol.token = await relogin();
    });

    it('category CRUD: duplicate slug -> 409, non-empty category cannot be deleted', async () => {
      const slug = `e2e-cat-${run}`;
      const cat = (await http().post('/api/admin/categories').set(auth(adminToken)).send({ name: `E2E Cat ${run}`, slug }).expect(201)).body;
      await http().post('/api/admin/categories').set(auth(adminToken)).send({ name: `E2E Other ${run}`, slug }).expect(409);
      await http().patch(`/api/admin/categories/${cat.id}`).set(auth(adminToken)).send({ name: `E2E Cat 2 ${run}`, slug: `${slug}-2` }).expect(200);
      await http().delete(`/api/admin/categories/${created.categoryId}`).set(auth(adminToken)).expect(409);
      await http().delete(`/api/admin/categories/${cat.id}`).set(auth(adminToken)).expect(204);
    });

    it('hidden products disappear from the store and cannot be ordered; never-ordered products can be deleted', async () => {
      const product = (
        await http()
          .post('/api/products')
          .set(auth(adminToken))
          .send({ name: `E2E Hidden ${run}`, slug: `e2e-hidden-${run}`, description: 'x', price: '10000', stock: 5, categoryId: created.categoryId })
          .expect(201)
      ).body;
      created.productIds.push(product.id);
      await http().put('/api/cart/items').set(auth(carol.token)).send({ productId: product.id, quantity: 1 }).expect(200);

      await http().patch(`/api/admin/products/${product.id}/active`).set(auth(adminToken)).send({ isActive: false }).expect(200);
      await http().get(`/api/products/${product.slug}`).expect(404);
      const list = await http().get(`/api/products?q=${encodeURIComponent(`E2E Hidden ${run}`)}`).expect(200);
      expect(list.body.total).toBe(0);
      const cart = await http().get('/api/cart').set(auth(carol.token)).expect(200);
      expect(cart.body.items[0].available).toBe(false);
      const hidden = await http().post('/api/orders').set(auth(carol.token)).set('Idempotency-Key', randomUUID()).send(shipping).expect(409);
      expect(hidden.body.code).toBe('PRODUCT_UNAVAILABLE');

      const adminList = await http().get(`/api/admin/products?status=hidden&q=e2e-hidden-${run}`).set(auth(adminToken)).expect(200);
      expect(adminList.body.items.map((p: { id: string }) => p.id)).toContain(product.id);

      await http().delete(`/api/admin/products/${product.id}`).set(auth(adminToken)).expect(204);
      const after = await http().get('/api/cart').set(auth(carol.token)).expect(200);
      expect(after.body.items).toHaveLength(0);
    });

    it('products that appear in orders cannot be deleted (409)', async () => {
      await http().delete(`/api/admin/products/${productId}`).set(auth(adminToken)).expect(409);
    });

    it('finds orders by short id / customer email / date range and exports CSV', async () => {
      await prisma.product.update({ where: { id: productId }, data: { stock: 5 } });
      await http().put('/api/cart/items').set(auth(carol.token)).send({ productId, quantity: 1 }).expect(200);
      const order = (await http().post('/api/orders').set(auth(carol.token)).set('Idempotency-Key', randomUUID()).send(shipping).expect(201)).body;

      const byId = await http().get(`/api/admin/orders?q=${order.id.slice(0, 8)}`).set(auth(adminToken)).expect(200);
      expect(byId.body.items.map((o: { id: string }) => o.id)).toContain(order.id);
      const byEmail = await http().get(`/api/admin/orders?q=${encodeURIComponent(carolEmail())}`).set(auth(adminToken)).expect(200);
      expect(byEmail.body.summary.count).toBe(1);
      const old = await http().get('/api/admin/orders?from=2000-01-01&to=2000-01-31').set(auth(adminToken)).expect(200);
      expect(old.body.total).toBe(0);

      const csv = await http().get(`/api/admin/orders/export?q=${encodeURIComponent(carolEmail())}`).set(auth(adminToken)).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain(order.id);
    });

    it('records every admin action in the audit log', async () => {
      const res = await http().get('/api/admin/audit-logs?limit=100').set(auth(adminToken)).expect(200);
      const actions = new Set(res.body.items.map((l: { action: string }) => l.action));
      for (const a of ['user.lock', 'user.unlock', 'user.role', 'category.create', 'category.delete', 'product.hide', 'product.delete']) {
        expect(actions).toContain(a);
      }
    });
  });

  it('exposes Prometheus metrics with business counters', async () => {
    const res = await http().get('/api/metrics').expect(200);
    expect(res.text).toContain('shop_orders_total{result="success"');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
  });
});
