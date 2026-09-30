import { Hono } from 'hono';
import { config } from '@/config';
import { serviceMetrics } from '@/shared/observability/metrics';

export const metricsRoute = new Hono();

metricsRoute.get('/', (c) => {
  if (!config.METRICS_ENABLED) {
    return c.text('Not Found', 404);
  }

  return c.text(serviceMetrics.renderPrometheus(), 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    'Cache-Control': 'no-store',
  });
});
