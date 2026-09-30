/**
 * Integration Tests — Example HTTP API
 *
 * Scope: End-to-end HTTP request → route → handler → service → in-memory repository.
 * Test memvalidasi contract API (status code, response shape, headers).
 * Tidak ada koneksi DB nyata.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { ExampleHandler } from '@/modules/example/example.handler';
import { ExampleService } from '@/modules/example/example.service';
import { ExampleRepository } from '@/modules/example/example.repository';
import { globalErrorHandler } from '@/shared/middleware/error-handler';
import { requestIdMiddleware } from '@/shared/middleware/request-id';

function buildApp() {
  const repository = new ExampleRepository(true);
  const service = new ExampleService(repository);
  const handler = new ExampleHandler(service);

  // Buat route baru dengan handler yang diinjeksi (in-memory)
  const { exampleRoute: testRoute } = buildTestRoute(handler);

  const app = new Hono();
  app.use('*', requestIdMiddleware());
  app.route('/api/v1/examples', testRoute);
  app.onError(globalErrorHandler);
  return { app, service };
}

/**
 * Build route segar dengan handler yang di-inject.
 * Ini diperlukan karena exampleRoute singleton menggunakan ExampleHandler default (real DB).
 */
function buildTestRoute(handler: ExampleHandler) {
  const { Hono } = require('hono');
  const { createExampleSchema, updateExampleSchema, exampleIdParamSchema, exampleListQuerySchema } =
    require('@/modules/example/example.schema');
  const { ValidationError } = require('@/shared/errors');

  const testRoute = new Hono();

  function parseQuery(c: any, schema: any) {
    const raw: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(c.req.query())) {
      raw[k] = Array.isArray(v) ? v[0] : (v as string);
    }
    return schema.parse(raw);
  }

  async function parseBody(c: any, schema: any) {
    let json: unknown;
    try { json = await c.req.json(); } catch { throw new ValidationError('Invalid JSON body'); }
    return schema.parse(json);
  }

  function parseParam(c: any, schema: any) {
    return schema.parse(c.req.param());
  }

  testRoute.get('/', async (c: any, next: any) => { c.set('listQuery', parseQuery(c, exampleListQuerySchema)); await next(); }, handler.getAll);
  testRoute.get('/:id/lookup', async (c: any, next: any) => { parseParam(c, exampleIdParamSchema); await next(); }, handler.getByIdWithLookup);
  testRoute.get('/:id', async (c: any, next: any) => { parseParam(c, exampleIdParamSchema); await next(); }, handler.getById);
  testRoute.post('/', async (c: any, next: any) => { c.set('body', await parseBody(c, createExampleSchema)); await next(); }, handler.create);
  testRoute.put('/:id', async (c: any, next: any) => { parseParam(c, exampleIdParamSchema); c.set('body', await parseBody(c, updateExampleSchema)); await next(); }, handler.update);
  testRoute.delete('/:id', async (c: any, next: any) => { parseParam(c, exampleIdParamSchema); await next(); }, handler.delete);

  return { exampleRoute: testRoute };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Example HTTP API — integration', () => {
  let app: Hono;
  let service: ExampleService;

  beforeEach(() => {
    ({ app, service } = buildApp());
  });

  // ── GET / ────────────────────────────────────────────────────────────────

  describe('GET /api/v1/examples', () => {
    it('should return 200 with cursor pagination shape on empty store', async () => {
      const res = await app.request('/api/v1/examples');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toBeArray();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.has_more).toBe(false);
      expect(body.pagination.next_cursor).toBeNull();
    });

    it('X-Request-ID header should be returned', async () => {
      const res = await app.request('/api/v1/examples');
      expect(res.headers.get('X-Request-ID')).toBeDefined();
    });

    it('should pass through X-Request-ID from request', async () => {
      const res = await app.request('/api/v1/examples', {
        headers: { 'X-Request-ID': 'my-trace-id' },
      });
      expect(res.headers.get('X-Request-ID')).toBe('my-trace-id');
    });

    it('should filter by status via query param', async () => {
      await service.create({ name: 'Active One' });
      const created = await service.create({ name: 'Inactive One' });
      await service.update(created.id, { status: 'inactive' });

      const res = await app.request('/api/v1/examples?status=inactive');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.every((i: any) => i.status === 'inactive')).toBe(true);
    });

    it('should detect has_more when items exceed limit', async () => {
      await service.create({ name: 'Item 1' });
      await service.create({ name: 'Item 2' });
      await service.create({ name: 'Item 3' });

      const res = await app.request('/api/v1/examples?limit=2');
      const body = await res.json();
      expect(body.data.length).toBe(2);
      expect(body.pagination.has_more).toBe(true);
      expect(body.pagination.next_cursor).not.toBeNull();
    });

    it('should reject invalid limit with 400', async () => {
      const res = await app.request('/api/v1/examples?limit=abc');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── GET /:id ─────────────────────────────────────────────────────────────

  describe('GET /api/v1/examples/:id', () => {
    it('should return 200 with item data', async () => {
      const item = await service.create({ name: 'Find Me' });
      const res = await app.request(`/api/v1/examples/${item.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(item.id);
      expect(body.data.name).toBe('Find Me');
    });

    it('should return 404 for non-existent id', async () => {
      const res = await app.request(`/api/v1/examples/${crypto.randomUUID()}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(body.error.request_id).toBeDefined();
    });

    it('should return 400 for invalid UUID param', async () => {
      const res = await app.request('/api/v1/examples/not-a-uuid');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── GET /:id/lookup ───────────────────────────────────────────────────────

  describe('GET /api/v1/examples/:id/lookup', () => {
    it('should return item with null category when no category_id', async () => {
      const item = await service.create({ name: 'No Cat' });
      const res = await app.request(`/api/v1/examples/${item.id}/lookup`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.category).toBeNull();
    });

    it('should return item with category when category_id is set', async () => {
      const item = await service.create({ name: 'Has Cat', category_id: 'cat-01' });
      const res = await app.request(`/api/v1/examples/${item.id}/lookup`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.category.code).toBe('GEN');
    });

    it('should return 404 for non-existent id', async () => {
      const res = await app.request(`/api/v1/examples/${crypto.randomUUID()}/lookup`);
      expect(res.status).toBe(404);
    });
  });

  // ── POST / ───────────────────────────────────────────────────────────────

  describe('POST /api/v1/examples', () => {
    it('should create item and return 201', async () => {
      const res = await app.request('/api/v1/examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Item', description: 'Created via HTTP' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe('New Item');
      expect(body.data.status).toBe('active');
    });

    it('should return 400 when name is empty', async () => {
      const res = await app.request('/api/v1/examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when body is not JSON', async () => {
      const res = await app.request('/api/v1/examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when category_id is not valid UUID', async () => {
      const res = await app.request('/api/v1/examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', category_id: 'bad-uuid' }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── PUT /:id ─────────────────────────────────────────────────────────────

  describe('PUT /api/v1/examples/:id', () => {
    it('should update item and return 200', async () => {
      const item = await service.create({ name: 'Old' });
      const res = await app.request(`/api/v1/examples/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New', status: 'inactive' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('New');
      expect(body.data.status).toBe('inactive');
    });

    it('should return 404 for non-existent item', async () => {
      const res = await app.request(`/api/v1/examples/${crypto.randomUUID()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ghost' }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────

  describe('DELETE /api/v1/examples/:id', () => {
    it('should delete item and return 200 with message', async () => {
      const item = await service.create({ name: 'Gone' });
      const res = await app.request(`/api/v1/examples/${item.id}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.message).toContain(item.id);
    });

    it('should return 404 when deleting non-existent item', async () => {
      const res = await app.request(`/api/v1/examples/${crypto.randomUUID()}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });
});
