import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthController, buildInfo, formatUptime } from './health.controller';

describe('HealthController', () => {
  const prisma = { isHealthy: jest.fn() };
  const redis = { isHealthy: jest.fn() };
  let controller: HealthController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns ok when database and redis are up', async () => {
    prisma.isHealthy.mockResolvedValue(true);
    redis.isHealthy.mockResolvedValue(true);

    const report = await controller.check();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('throws 503 when database is down', async () => {
    prisma.isHealthy.mockResolvedValue(false);
    redis.isHealthy.mockResolvedValue(true);

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws 503 when redis hangs longer than the timeout', async () => {
    prisma.isHealthy.mockResolvedValue(true);
    redis.isHealthy.mockReturnValue(new Promise(() => undefined));

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  }, 5000);

  it('liveness does not touch the database', () => {
    expect(controller.live()).toMatchObject({ status: 'ok' });
    expect(prisma.isHealthy).not.toHaveBeenCalled();
  });
});

describe('build info (bằng chứng CI/CD: commit đang chạy = commit trên GitHub)', () => {
  it('derives short commit, release number, environment and a link to the commit', () => {
    const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
    expect(buildInfo({ APP_VERSION: sha, APP_BUILD: '42', APP_ENV: 'staging', APP_REPOSITORY: 'me/shop' } as NodeJS.ProcessEnv)).toMatchObject({
      version: sha,
      commit: 'a1b2c3d',
      release: '1.0.42',
      environment: 'staging',
      commitUrl: `https://github.com/me/shop/commit/${sha}`,
    });
  });

  it('local builds are labelled dev / development with no commit link', () => {
    expect(buildInfo({} as NodeJS.ProcessEnv)).toMatchObject({ version: 'dev', commit: 'dev', release: null, environment: 'development', commitUrl: null });
    expect(buildInfo({ NODE_ENV: 'production' } as NodeJS.ProcessEnv).environment).toBe('production');
  });

  it('formats uptime for humans', () => {
    expect(formatUptime(59)).toBe('0m');
    expect(formatUptime(3 * 86_400 + 4 * 3600 + 12 * 60)).toBe('3d 4h 12m');
  });
});
