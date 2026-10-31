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
import { PrismaService } from '../src/prisma/prisma.service';

describe('Home Shopping API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = randomUUID().slice(0, 8);
  const password = 'E2eTest123';
  const created = { userIds: [] as string[], productIds: [] as string[], categoryId: 0 };
  // Bắt email thay vì gửi SMTP thật → đọc được link đặt lại mật khẩu trong test
  const outbox: MailMessage[] = [];
  const fakeMail = { enabled: true, send: async (m: MailMessage) => (outbox.push(m), true) };

  let adminToken: string;
  let aliceToken: string;
  let bobToken: string;
  let productId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const shipping = { shippingAddress: '123 Lê Lợi, Quận 1, TP. Hồ Chí Minh', phone: '0901234567' };

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
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.order.deleteMany({ where: { userId: { in: created.userIds } } });
      await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
      await prisma.category.deleteMany({ where: { id: created.categoryId } });
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
      await prisma.newsletterSubscriber.deleteMany({ where: { email: { endsWith: `${run}@e2e.test` } } });
    }
    await app?.close();
  });

  it('GET /api/health reports database and redis up', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.body.checks).toEqual({ database: 'up', redis: 'up' });
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
    expect(res.body.price).toBe('450000.00');
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

    const res = await http().post(`/api/orders/${pending.id}/cancel`).set(auth(aliceToken)).expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(before + 2);
    await http().post(`/api/orders/${pending.id}/cancel`).set(auth(aliceToken)).expect(409);
  });

  it('customers cannot read other customers orders', async () => {
    const aliceOrders = await http().get('/api/orders').set(auth(aliceToken)).expect(200);
    await http().get(`/api/orders/${aliceOrders.body[0].id}`).set(auth(bobToken)).expect(404);
  });

  it('admin moves an order through its lifecycle and invalid transitions are rejected', async () => {
    const list = await http().get('/api/admin/orders').query({ status: 'PENDING' }).set(auth(adminToken)).expect(200);
    const order = list.body.items.find((o: { user: { email: string } }) => o.user.email.endsWith(`${run}@e2e.test`));
    expect(order).toBeDefined();

    for (const status of ['PAID', 'SHIPPING', 'COMPLETED']) {
      const res = await http().patch(`/api/admin/orders/${order.id}/status`).set(auth(adminToken)).send({ status }).expect(200);
      expect(res.body.status).toBe(status);
    }
    await http().patch(`/api/admin/orders/${order.id}/status`).set(auth(adminToken)).send({ status: 'CANCELLED' }).expect(400);

    const stats = await http().get('/api/admin/stats').set(auth(adminToken)).expect(200);
    expect(stats.body.revenueDaily).toHaveLength(30);
    expect(Number(stats.body.kpis.revenueAll)).toBeGreaterThan(0);
    expect(Number(stats.body.kpis.revenueToday)).toBeGreaterThan(0);
    expect(stats.body.revenueByCategory.some((c: { slug: string }) => c.slug === `e2e-${run}`)).toBe(true);
    expect(stats.body.recentOrders.length).toBeGreaterThan(0);
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
    // 1 (đơn mua đồng thời) + 2 (đơn idempotent) − 2 (đơn bị hủy) = 1
    expect(product.soldCount).toBe(1);
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

  it('newsletter subscription is idempotent and sends one welcome mail', async () => {
    const email = `news-${run}@e2e.test`;
    await http().post('/api/newsletter/subscribe').send({ email }).expect(200);
    await http().post('/api/newsletter/subscribe').send({ email: email.toUpperCase() }).expect(200);
    expect(outbox.filter((m) => m.to === email)).toHaveLength(1);
    await http().post('/api/newsletter/subscribe').send({ email: 'not-an-email' }).expect(400);
  });

  it('media endpoint only serves server-generated paths', async () => {
    await http().get('/api/media/products/..%2F..%2Fetc/passwd').expect(404);
    await http().get(`/api/media/products/${productId}/${randomUUID()}.webp`).expect(404);
  });

  it('exposes Prometheus metrics with business counters', async () => {
    const res = await http().get('/api/metrics').expect(200);
    expect(res.text).toContain('shop_orders_total{result="success"');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
  });
});
