import type { MiddlewareHandler } from 'hono';
import { logger } from '@/shared/logger';
import { serviceMetrics } from '@/shared/observability/metrics';

export const loggerMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = performance.now();
    const method = c.req.method;
    const path = c.req.path;
    const requestId = c.get('requestId') as string | undefined;

    serviceMetrics.httpRequestStarted();

    let status = 500;

    try {
      await next();
      status = c.res.status;
    } finally {
      const duration = Math.round(performance.now() - start);
      serviceMetrics.recordHttpRequest(method, status, duration);

      logger.info(`HTTP ${method} ${path} ${status}`, {
        request_id: requestId,
        method,
        path,
        status,
        duration_ms: duration,
      });
    }
  };
};
