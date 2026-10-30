import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly ordersTotal = new Counter({
    name: 'shop_orders_total',
    help: 'Orders processed by result',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly orderStatusTransitions = new Counter({
    name: 'shop_order_status_transitions_total',
    help: 'Order status transitions (admin fulfilment / customer cancellation)',
    labelNames: ['from', 'to'] as const,
    registers: [this.registry],
  });

  readonly authEvents = new Counter({
    name: 'shop_auth_events_total',
    help: 'Authentication events by type',
    labelNames: ['event'] as const,
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ app: 'home-shopping-backend' });
    collectDefaultMetrics({ register: this.registry });
  }
}
