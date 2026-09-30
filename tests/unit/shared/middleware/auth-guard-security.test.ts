import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type { AppEnv } from '@/shared/types/context';
import { authGuard, globalErrorHandler } from '@/shared/middleware';

describe('authGuard security behavior', () => {
  it('maps verifier failures to a generic 401 response', async () => {
    const app = new Hono<AppEnv>();
    app.use(
      '*',
      authGuard({
        verifyToken: async () => {
          throw new Error('jwt signature debug detail');
        },
      })
    );
    app.get('/', (c) => c.json({ sub: c.get('principal')?.sub }));
    app.onError(globalErrorHandler);

    const response = await app.request('/', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.message).toBe('Invalid or expired credentials');
    expect(JSON.stringify(payload)).not.toContain('signature');
  });

  it('rejects a verifier result without a valid subject', async () => {
    const app = new Hono<AppEnv>();
    app.use(
      '*',
      authGuard({
        verifyToken: async () => ({ sub: '   ' }),
      })
    );
    app.get('/', (c) => c.text('ok'));
    app.onError(globalErrorHandler);

    const response = await app.request('/', {
      headers: { Authorization: 'Bearer valid-looking-token' },
    });

    expect(response.status).toBe(401);
  });

  it('sets a valid authenticated principal', async () => {
    const app = new Hono<AppEnv>();
    app.use(
      '*',
      authGuard({
        verifyToken: async () => ({ sub: 'user-123', roles: ['reader'] }),
      })
    );
    app.get('/', (c) => c.json({ sub: c.get('principal')?.sub }));
    app.onError(globalErrorHandler);

    const response = await app.request('/', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sub: 'user-123' });
  });
});
