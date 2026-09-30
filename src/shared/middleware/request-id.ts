import type { MiddlewareHandler } from 'hono';

export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const existingRequestId = c.req.header('X-Request-ID');
    const requestId = existingRequestId || `req_${crypto.randomUUID()}`;

    c.set('requestId', requestId);
    c.res.headers.set('X-Request-ID', requestId);

    await next();
  };
};
