import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Thông tin bản build đang chạy – do CI ghi vào image (Docker build-arg) / compose:
 *  APP_VERSION = commit SHA đầy đủ · APP_BUILD = số lần chạy pipeline (→ phiên bản 1.0.<n>)
 *  APP_ENV = production | staging · APP_REPOSITORY = owner/repo trên GitHub (tạo link tới đúng commit)
 */
export interface BuildInfo {
  /** Commit SHA đầy đủ (khớp `git rev-parse HEAD` trên GitHub) */
  version: string;
  /** 7 ký tự đầu – hiển thị ở footer "build #a1b2c3d" */
  commit: string;
  /** Phiên bản ngữ nghĩa 1.0.<số build>; null khi chạy local */
  release: string | null;
  environment: string;
  commitUrl: string | null;
  startedAt: string;
}

export interface HealthReport extends BuildInfo {
  status: 'ok' | 'error';
  uptimeSeconds: number;
  /** "3d 4h 12m" – dễ đọc khi trình bày */
  uptime: string;
  checks: { database: 'up' | 'down'; redis: 'up' | 'down' };
  latencyMs: { database: number; redis: number };
  node: string;
  timestamp: string;
}

const STARTED_AT = new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString();

export function buildInfo(env: NodeJS.ProcessEnv = process.env): BuildInfo {
  const version = env.APP_VERSION || 'dev';
  const isSha = /^[0-9a-f]{7,40}$/.test(version);
  const repo = env.APP_REPOSITORY || 'QuocAnh-205/home-shopping-app';
  const build = Number.parseInt(env.APP_BUILD ?? '', 10);
  return {
    version,
    commit: isSha ? version.slice(0, 7) : version,
    release: Number.isFinite(build) && build > 0 ? `1.0.${build}` : null,
    environment: env.APP_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development'),
    commitUrl: isSha ? `https://github.com/${repo}/commit/${version}` : null,
    startedAt: STARTED_AT,
  };
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d ? `${d}d` : '', h ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
}

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Readiness: ứng dụng + PostgreSQL + Redis đều sẵn sàng (Docker HEALTHCHECK, deploy.sh, smoke test, uptime alert) */
  @Get()
  @Header('Cache-Control', 'no-store')
  async check(): Promise<HealthReport> {
    const [db, cache] = await Promise.all([timed(this.prisma.isHealthy(), 2000), timed(this.redis.isHealthy(), 2000)]);
    const uptimeSeconds = Math.round(process.uptime());

    const report: HealthReport = {
      status: db.ok && cache.ok ? 'ok' : 'error',
      ...buildInfo(),
      uptimeSeconds,
      uptime: formatUptime(uptimeSeconds),
      checks: { database: db.ok ? 'up' : 'down', redis: cache.ok ? 'up' : 'down' },
      latencyMs: { database: db.ms, redis: cache.ms },
      node: process.version,
      timestamp: new Date().toISOString(),
    };

    if (report.status !== 'ok') {
      // Trả 503 để Docker HEALTHCHECK và script deploy phát hiện và rollback
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  /** Alias rõ nghĩa của readiness */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  ready(): Promise<HealthReport> {
    return this.check();
  }

  /** Liveness: tiến trình Node còn sống (không phụ thuộc DB) – dùng để phân biệt "app treo" với "DB sập" */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Thông tin build (không truy vấn DB) – footer website hiển thị "v1.0.N · build #abc1234 (Production)" */
  @Get('version')
  @Header('Cache-Control', 'public, max-age=60')
  version(): BuildInfo {
    return buildInfo();
  }
}

async function timed(promise: Promise<boolean>, ms: number): Promise<{ ok: boolean; ms: number }> {
  const start = performance.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    const ok = await Promise.race([promise, timeout]);
    return { ok, ms: Math.round(performance.now() - start) };
  } finally {
    clearTimeout(timer);
  }
}
