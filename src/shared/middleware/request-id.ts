import type { MiddlewareHandler } from 'hono';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function normalizeRequestId(value: string | undefined): string {
  if (value && REQUEST_ID_PATTERN.test(value)) {
    return value;
  }

  return `req_${crypto.randomUUID()}`;
}

export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = normalizeRequestId(c.req.header('X-Request-ID'));

    c.set('requestId', requestId);

    await next();

    c.header('X-Request-ID', requestId);
  };
};
