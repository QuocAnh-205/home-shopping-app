import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthController } from './health.controller';

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
});
