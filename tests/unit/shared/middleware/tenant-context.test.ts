import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type { AppEnv } from '@/shared/types/context';
import { globalErrorHandler, tenantContext } from '@/shared/middleware';
import { sendSuccess } from '@/shared/http/response';

describe('tenantContext', () => {
  it('rejects tenant access when authorization callback denies it', async () => {
    const app = new Hono<AppEnv>();
    app.use(
      '*',
      tenantContext({
        authorizeTenant: async () => false,
      })
    );
    app.get('/', (c) => sendSuccess(c, { tenant_id: c.get('tenantId') }));
    app.onError(globalErrorHandler);

    const response = await app.request('/', {
      headers: { 'X-Tenant-ID': 'tenant-a' },
    });

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error.code).toBe('FORBIDDEN');
  });

  it('sets tenant context only after authorization succeeds', async () => {
    const app = new Hono<AppEnv>();
    app.use(
      '*',
      tenantContext({
        authorizeTenant: async (tenantId) => tenantId === 'tenant-a',
      })
    );
    app.get('/', (c) => sendSuccess(c, { tenant_id: c.get('tenantId') }));
    app.onError(globalErrorHandler);

    const response = await app.request('/', {
      headers: { 'X-Tenant-ID': 'tenant-a' },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.tenant_id).toBe('tenant-a');
  });

  it('rejects malformed tenant identifiers before authorization', async () => {
    let authorizeCalls = 0;
    const app = new Hono<AppEnv>();
    app.use(
      '*',
      tenantContext({
        authorizeTenant: async () => {
          authorizeCalls += 1;
          return true;
        },
      })
    );
    app.get('/', (c) => sendSuccess(c, {}));
    app.onError(globalErrorHandler);

    const response = await app.request('/', {
      headers: { 'X-Tenant-ID': 'tenant with spaces' },
    });

    expect(response.status).toBe(400);
    expect(authorizeCalls).toBe(0);
  });
});
