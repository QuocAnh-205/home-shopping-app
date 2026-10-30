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
import { PrismaService } from '../src/prisma/prisma.service';

describe('Home Shopping API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = randomUUID().slice(0, 8);
  const password = 'E2eTest123';
  const created = { userIds: [] as string[], productIds: [] as string[], categoryId: 0 };

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    expect(stats.body.revenueLast7Days).toHaveLength(7);
    expect(Number(stats.body.revenue)).toBeGreaterThan(0);
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

  it('exposes Prometheus metrics with business counters', async () => {
    const res = await http().get('/api/metrics').expect(200);
    expect(res.text).toContain('shop_orders_total{result="success"');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
  });
});
