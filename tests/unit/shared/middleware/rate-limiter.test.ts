import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { rateLimiter } from '@/shared/middleware';

describe('rateLimiter', () => {
  it('does not trust X-Forwarded-For or X-Real-IP by default', async () => {
    const app = new Hono();
    app.use('*', rateLimiter({ max: 1, windowMs: 60_000 }));
    app.get('/', (c) => c.text('ok'));

    const first = await app.request('/', {
      headers: {
        'X-Forwarded-For': '198.51.100.10',
        'X-Real-IP': '198.51.100.10',
      },
    });

    const second = await app.request('/', {
      headers: {
        'X-Forwarded-For': '203.0.113.25',
        'X-Real-IP': '203.0.113.25',
      },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('supports an explicit trusted key function', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        max: 1,
        windowMs: 60_000,
        keyFn: (c) => c.req.header('X-Test-Key') ?? 'missing',
      })
    );
    app.get('/', (c) => c.text('ok'));

    const first = await app.request('/', { headers: { 'X-Test-Key': 'client-a' } });
    const second = await app.request('/', { headers: { 'X-Test-Key': 'client-b' } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
