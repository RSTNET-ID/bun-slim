import type { Context, MiddlewareHandler } from 'hono';
import { logger } from '@/shared/logger';
import { sendError } from '@/shared/http/response';

/**
 * Rate Limiter Middleware (In-Process / In-Memory)
 *
 * Cocok hanya untuk proteksi ringan pada single process. Untuk enforcement
 * lintas replica/process gunakan Redis-backed rate limiter.
 */
export interface RateLimiterOptions {
  /** Window waktu dalam millisecond. Default: 60_000 (1 menit) */
  windowMs?: number;
  /** Maksimum request per window per key. Default: 100 */
  max?: number;
  /**
   * Key identifier. Untuk public traffic sebaiknya diberikan secara eksplisit.
   * Jangan membaca X-Forwarded-For/X-Real-IP kecuali reverse proxy trust boundary
   * benar-benar dikendalikan oleh deployment.
   */
  keyFn?: (c: Context) => string;
}

interface RateEntry {
  count: number;
  resetAt: number;
}

export const rateLimiter = (options: RateLimiterOptions = {}): MiddlewareHandler => {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 100;
  const store = new Map<string, RateEntry>();
  let nextCleanupAt = Date.now() + windowMs;

  return async (c, next) => {
    const now = Date.now();

    // Opportunistic cleanup avoids one background timer per middleware instance.
    if (now >= nextCleanupAt) {
      for (const [key, entry] of store) {
        if (entry.resetAt <= now) store.delete(key);
      }
      nextCleanupAt = now + windowMs;
    }

    const principal = c.get('principal') as { sub?: string } | undefined;
    const tenantId = c.get('tenantId') as string | undefined;
    const key = options.keyFn?.(c) ?? principal?.sub ?? tenantId ?? 'anonymous';

    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    current.count += 1;

    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      c.header('Retry-After', String(retryAfterSeconds));

      logger.warn('Rate limit exceeded', {
        request_id: c.get('requestId') as string | undefined,
        key,
        count: current.count,
      });

      return sendError(c, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 429, {
        retry_after_seconds: retryAfterSeconds,
      });
    }

    await next();
  };
};
