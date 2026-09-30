/**
 * Unit Tests — Cursor Pagination (sendCursorPaginated)
 *
 * Scope: Memvalidasi logic cursor pagination helper secara terisolasi.
 */
import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { sendCursorPaginated } from '@/shared/http/response';

interface TestItem {
  id: string;
  name: string;
}

function buildTestApp(items: TestItem[], limit: number, cursor?: string) {
  const app = new Hono();
  app.get('/test', (c) => {
    return sendCursorPaginated<TestItem>(c, items, limit, (i) => i.id, cursor);
  });
  return app;
}

describe('sendCursorPaginated — unit', () => {
  it('should return all items when count <= limit (has_more = false)', async () => {
    const items: TestItem[] = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ];
    const app = buildTestApp(items, 5);
    const res = await app.request('/test');
    const body = await res.json();

    expect(body.data.length).toBe(2);
    expect(body.pagination.has_more).toBe(false);
    expect(body.pagination.next_cursor).toBeNull();
    expect(body.pagination.count).toBe(2);
    expect(body.pagination.limit).toBe(5);
  });

  it('should detect has_more when items > limit', async () => {
    const items: TestItem[] = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
      { id: 'c', name: 'Gamma' }, // extra item (limit+1)
    ];
    const app = buildTestApp(items, 2);
    const res = await app.request('/test');
    const body = await res.json();

    expect(body.data.length).toBe(2);
    expect(body.pagination.has_more).toBe(true);
    expect(body.pagination.next_cursor).toBe('b'); // last of sliced data
    expect(body.pagination.count).toBe(2);
  });

  it('should set next_cursor to the last item id of the returned page', async () => {
    const items: TestItem[] = [
      { id: 'x1', name: 'One' },
      { id: 'x2', name: 'Two' },
      { id: 'x3', name: 'Three' }, // extra
    ];
    const app = buildTestApp(items, 2);
    const res = await app.request('/test');
    const body = await res.json();

    expect(body.pagination.next_cursor).toBe('x2');
  });

  it('should reflect prev_cursor from argument', async () => {
    const items: TestItem[] = [{ id: 'y', name: 'Page 2 item' }];
    const app = buildTestApp(items, 10, 'prev-cursor-id');
    const res = await app.request('/test');
    const body = await res.json();

    expect(body.pagination.prev_cursor).toBe('prev-cursor-id');
  });

  it('should return 200 status code', async () => {
    const app = buildTestApp([], 10);
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});
