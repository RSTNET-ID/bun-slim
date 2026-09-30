import type { MiddlewareHandler } from 'hono';
import { logger } from '@/shared/logger';

export const loggerMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = performance.now();
    const method = c.req.method;
    const path = c.req.path;
    const requestId = c.get('requestId') as string | undefined;

    await next();

    const duration = Math.round(performance.now() - start);
    const status = c.res.status;

    logger.info(`HTTP ${method} ${path} ${status}`, {
      request_id: requestId,
      method,
      path,
      status,
      duration_ms: duration,
    });
  };
};
