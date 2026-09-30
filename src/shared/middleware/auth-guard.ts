import type { MiddlewareHandler } from 'hono';
import { UnauthorizedError } from '@/shared/errors';

/**
 * Auth Guard Middleware
 *
 * Memvalidasi Bearer token dari header Authorization.
 * Letakkan di route yang membutuhkan autentikasi.
 *
 * Contoh penggunaan:
 *   app.use('/api/v1/examples/*', authGuard({ verifyToken: myVerifyFn }))
 *
 * Production: ganti verifyToken dengan JWT verification atau call ke auth service.
 */
export interface AuthGuardOptions {
  /**
   * Fungsi untuk memverifikasi token dan mengembalikan payload principal.
   * Lempar error bila token tidak valid.
   */
  verifyToken: (token: string) => Promise<{ sub: string; roles?: string[] }>;
}

export const authGuard = (options: AuthGuardOptions): MiddlewareHandler => {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);
    if (!token) {
      throw new UnauthorizedError('Token is empty');
    }

    const principal = await options.verifyToken(token);

    // Simpan principal ke context agar handler bisa mengaksesnya
    c.set('principal', principal);

    await next();
  };
};
