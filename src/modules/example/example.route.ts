import { Hono } from 'hono';
import { ExampleHandler } from './example.handler';
import { createExampleSchema, updateExampleSchema, exampleIdParamSchema, exampleListQuerySchema } from './example.schema';
import { ValidationError } from '@/shared/errors';

export const exampleRoute = new Hono();
const handler = new ExampleHandler();

// ─── Helper validators ────────────────────────────────────────────────────────
// Validasi sekaligus menyimpan hasil ke c.set() agar handler tidak perlu parse ulang.

async function parseBody<T>(c: any, schema: any): Promise<T> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new ValidationError('Invalid or missing JSON body');
  }
  return schema.parse(json);
}

function parseParam<T>(c: any, schema: any): T {
  return schema.parse(c.req.param());
}

function parseQuery<T>(c: any, schema: any): T {
  const raw: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(c.req.query())) {
    raw[k] = Array.isArray(v) ? v[0] : (v as string);
  }
  return schema.parse(raw);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/v1/examples?cursor=uuid&limit=20&status=active
exampleRoute.get('/', async (c, next) => {
  // Parse + store agar handler tidak double-parse
  c.set('listQuery', parseQuery(c, exampleListQuerySchema));
  await next();
}, handler.getAll);

// GET /api/v1/examples/:id/lookup  — MUST be before /:id to avoid param conflict
exampleRoute.get('/:id/lookup', async (c, next) => {
  parseParam(c, exampleIdParamSchema);
  await next();
}, handler.getByIdWithLookup);

// GET /api/v1/examples/:id
exampleRoute.get('/:id', async (c, next) => {
  parseParam(c, exampleIdParamSchema);
  await next();
}, handler.getById);

// POST /api/v1/examples
exampleRoute.post('/', async (c, next) => {
  c.set('body', await parseBody(c, createExampleSchema));
  await next();
}, handler.create);

// PUT /api/v1/examples/:id
exampleRoute.put('/:id', async (c, next) => {
  parseParam(c, exampleIdParamSchema);
  c.set('body', await parseBody(c, updateExampleSchema));
  await next();
}, handler.update);

// DELETE /api/v1/examples/:id
exampleRoute.delete('/:id', async (c, next) => {
  parseParam(c, exampleIdParamSchema);
  await next();
}, handler.delete);
