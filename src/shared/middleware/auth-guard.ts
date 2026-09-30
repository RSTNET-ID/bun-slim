import type { MiddlewareHandler } from 'hono';
import { UnauthorizedError } from '@/shared/errors';
import type { AuthPrincipal } from '@/shared/types/context';

/**
 * Auth Guard Middleware
 *
 * Validates a Bearer token through a service-provided verifier.
 * The verifier is responsible for cryptographic/token validation and revocation policy.
 */
export interface AuthGuardOptions {
  verifyToken: (token: string) => Promise<AuthPrincipal>;
}

export const authGuard = (options: AuthGuardOptions): MiddlewareHandler => {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedError('Token is empty');
    }

    let principal: AuthPrincipal;
    try {
      principal = await options.verifyToken(token);
    } catch {
      // Do not leak verifier/provider details to the caller.
      throw new UnauthorizedError('Invalid or expired credentials');
    }

    if (!principal || typeof principal.sub !== 'string' || principal.sub.trim().length === 0) {
      throw new UnauthorizedError('Invalid authentication principal');
    }

    c.set('principal', principal);
    await next();
  };
};
