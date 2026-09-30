import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { config } from '@/config';
import { sendError } from '@/shared/http/response';
import { serviceMetrics } from '@/shared/observability/metrics';

export const metricsRoute = new Hono();

metricsRoute.get('/', (c) => {
  if (!config.METRICS_ENABLED) {
    return c.text('Not Found', 404);
  }

  if (config.METRICS_TOKEN) {
    const authorization = c.req.header('Authorization');
    const expected = `Bearer ${config.METRICS_TOKEN}`;

    if (!authorization || !constantTimeEqual(authorization, expected)) {
      c.header('WWW-Authenticate', 'Bearer realm="metrics"');
      return sendError(c, 'UNAUTHORIZED', 'Unauthorized', 401);
    }
  }

  return c.text(serviceMetrics.renderPrometheus(), 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    'Cache-Control': 'no-store',
  });
});

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  if (actualBytes.length !== expectedBytes.length) {
    return false;
  }

  return timingSafeEqual(actualBytes, expectedBytes);
}
