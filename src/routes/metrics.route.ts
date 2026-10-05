import { Hono } from 'hono';
import { config } from '@/config';
import { sendError } from '@/shared/http/response';
import { isMetricsAuthorized } from '@/shared/observability/metrics-auth';
import { serviceMetrics } from '@/shared/observability/metrics';

export const metricsRoute = new Hono();

metricsRoute.get('/', (c) => {
  if (!config.METRICS_ENABLED) {
    return c.text('Not Found', 404);
  }

  if (!isMetricsAuthorized(c.req.header('Authorization'), config.METRICS_TOKEN)) {
    c.header('WWW-Authenticate', 'Bearer realm="metrics"');
    return sendError(c, 'UNAUTHORIZED', 'Unauthorized', 401);
  }

  return c.text(serviceMetrics.renderPrometheus(), 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    'Cache-Control': 'no-store',
  });
});

