import type { Context, MiddlewareHandler } from 'hono';
import { logger } from '@/shared/logger';

/**
 * Rate Limiter Middleware (In-Process / In-Memory)
 *
 * Untuk production gunakan Redis-backed rate limiter.
 * Middleware ini cocok untuk proteksi ringan di service tanpa Redis.
 *
 * Contoh penggunaan:
 *   app.use('/api/v1/examples', rateLimiter({ windowMs: 60_000, max: 100 }))
 */
export interface RateLimiterOptions {
  /** Window waktu dalam millisecond. Default: 60_000 (1 menit) */
  windowMs?: number;
  /** Maksimum request per window per IP. Default: 100 */
  max?: number;
  /** Key identifier selain IP. Dapat menggunakan header seperti X-Tenant-ID */
  keyFn?: (c: Context) => string;
}

interface RateEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateEntry>();

export const rateLimiter = (options: RateLimiterOptions = {}): MiddlewareHandler => {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 100;

  // Bersihkan entry lama setiap windowMs
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key);
    }
  };
  setInterval(cleanup, windowMs);

  return async (c, next) => {
    const key = options.keyFn
      ? options.keyFn(c)
      : (c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown');

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count += 1;
      if (entry.count > max) {
        logger.warn('Rate limit exceeded', { key, count: entry.count });
        return c.json(
          {
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Too many requests. Retry after ${Math.ceil((entry.resetAt - now) / 1000)}s`,
            },
          },
          429
        );
      }
    }

    await next();
  };
};
