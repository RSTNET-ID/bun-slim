import type { MiddlewareHandler } from 'hono';
import { config } from '@/config';

export const securityHeadersMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();

    if (!config.SECURITY_HEADERS_ENABLED) return;

    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    c.header('X-Permitted-Cross-Domain-Policies', 'none');
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );
  };
};
