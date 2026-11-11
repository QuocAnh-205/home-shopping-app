import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { CheckoutModule } from './checkout/checkout.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { LocationsModule } from './locations/locations.module';
import { MailModule } from './mail/mail.module';
import { MediaModule } from './media/media.module';
import { MetricsModule } from './metrics/metrics.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RedisModule } from './redis/redis.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ShippingModule } from './shipping/shipping.module';
import { StorageModule } from './storage/storage.module';
import { VouchersModule } from './vouchers/vouchers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Level dạng chữ ("info"/"error") để Promtail gắn label trực tiếp, Grafana lọc dễ
        formatters: { level: (label: string) => ({ level: label }) },
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.token', 'req.query.code'],
          censor: '[REDACTED]',
        },
        autoLogging: {
          ignore: (req) => req.url === '/api/health' || req.url === '/api/metrics',
        },
        customProps: () => ({ service: 'backend' }),
        serializers: {
          // Callback OAuth chứa code/state trên query → chỉ log path, không log query
          req: (req: { id: string; method: string; url: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url.startsWith('/api/auth/oauth/') ? req.url.split('?')[0] : req.url,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      // Chỉ test e2e được tắt (env.validation chặn cờ này ở production)
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AccountModule,
    RedisModule,
    StorageModule,
    MailModule,
    MediaModule,
    MetricsModule,
    HealthModule,
    AuthModule,
    CategoriesModule,
    LocationsModule,
    ShippingModule,
    ProductsModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    ReviewsModule,
    NewsletterModule,
    AdminModule,
    VouchersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
