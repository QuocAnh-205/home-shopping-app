import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  configureApp(app);

  const port = Number(process.env.PORT ?? 8080);
  const server = await app.listen(port, '0.0.0.0');
  // keepAlive của Node phải dài hơn của Nginx upstream (60s) → tránh lỗi 502 "upstream prematurely closed"
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  logger.log(`Backend listening on port ${port}`, 'Bootstrap');
}

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'fatal', msg: 'unhandledRejection', reason: String(reason) }));
});

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'fatal', msg: 'Bootstrap failed', err: String(err) }));
  process.exit(1);
});
