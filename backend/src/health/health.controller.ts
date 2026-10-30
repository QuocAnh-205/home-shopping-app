import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface HealthReport {
  status: 'ok' | 'error';
  version: string;
  uptimeSeconds: number;
  checks: { database: 'up' | 'down'; redis: 'up' | 'down' };
  timestamp: string;
}

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async check(): Promise<HealthReport> {
    const [db, cache] = await Promise.all([
      withTimeout(this.prisma.isHealthy(), 2000),
      withTimeout(this.redis.isHealthy(), 2000),
    ]);

    const report: HealthReport = {
      status: db && cache ? 'ok' : 'error',
      version: process.env.APP_VERSION ?? 'dev',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: db ? 'up' : 'down', redis: cache ? 'up' : 'down' },
      timestamp: new Date().toISOString(),
    };

    if (report.status !== 'ok') {
      // Trả 503 để Docker HEALTHCHECK và script deploy phát hiện và rollback
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}

async function withTimeout(promise: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
