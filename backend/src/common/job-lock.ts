import { Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Khóa phân tán cho job nền (SET NX EX): nhiều instance backend thì mỗi lượt chỉ 1 instance chạy job.
 * Các bước bên trong job vẫn phải tự an toàn khi chạy trùng (UPDATE có điều kiện) – khóa chỉ để giảm việc thừa.
 */
export async function withJobLock(redis: RedisService, logger: Logger, key: string, ttlSeconds: number, fn: () => Promise<unknown>): Promise<void> {
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const acquired = await redis.client.set(key, token, 'EX', ttlSeconds, 'NX').catch(() => null);
  if (acquired !== 'OK') return;
  try {
    await fn();
  } catch (err) {
    logger.error({ event: 'job.failed', job: key, err: (err as Error).message });
  } finally {
    if ((await redis.client.get(key).catch(() => null)) === token) await redis.client.del(key).catch(() => undefined);
  }
}
