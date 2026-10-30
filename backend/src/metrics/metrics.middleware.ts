import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

// Đo ở tầng middleware (sự kiện 'finish') để bắt được cả response bị Guard chặn (401/403/429)
// và lỗi 5xx do Exception Filter trả về.
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.originalUrl.startsWith('/api/metrics')) return next();

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      // Dùng route pattern (vd: /api/products/:slug) thay vì URL thật để tránh bùng nổ cardinality
      const routePath = req.route?.path as string | undefined;
      const route = routePath ? `${req.baseUrl}${routePath}` : 'unmatched';
      const labels = { method: req.method, route, status: String(res.statusCode) };
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.httpRequestsTotal.inc(labels);
      this.metrics.httpRequestDuration.observe(labels, seconds);
    });
    next();
  }
}
