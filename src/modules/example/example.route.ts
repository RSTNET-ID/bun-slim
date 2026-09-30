import { Hono, type Context } from 'hono';
import type { AppEnv } from '@/shared/types/context';
import { ExampleHandler } from './example.handler';
import {
  createExampleSchema,
  updateExampleSchema,
  exampleIdParamSchema,
  exampleListQuerySchema,
} from './example.schema';
import { ValidationError } from '@/shared/errors';
import type { CreateExampleDTO, UpdateExampleDTO } from './example.types';

export const exampleRoute = new Hono<AppEnv>();
const handler = new ExampleHandler();

// ─── Helper validators ────────────────────────────────────────────────────────
interface ParserSchema<T> {
  parse(input: unknown): T;
}

async function parseBody<T>(c: Context<AppEnv>, schema: ParserSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new ValidationError('Invalid or missing JSON body');
  }
  return schema.parse(json);
}

function parseParam<T>(c: Context<AppEnv>, schema: ParserSchema<T>): T {
  return schema.parse(c.req.param());
}

function parseQuery<T>(c: Context<AppEnv>, schema: ParserSchema<T>): T {
  const raw: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(c.req.query())) {
    raw[k] = Array.isArray(v) ? v[0] : (v as string);
  }
  return schema.parse(raw);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/v1/examples?cursor=uuid&limit=20&status=active
exampleRoute.get(
  '/',
  async (c, next) => {
    c.set('listQuery', parseQuery(c, exampleListQuerySchema));
    await next();
  },
  handler.getAll
);

// GET /api/v1/examples/:id/lookup  — MUST be before /:id to avoid param conflict
exampleRoute.get(
  '/:id/lookup',
  async (c, next) => {
    parseParam(c, exampleIdParamSchema);
    await next();
  },
  handler.getByIdWithLookup
);

// GET /api/v1/examples/:id
exampleRoute.get(
  '/:id',
  async (c, next) => {
    parseParam(c, exampleIdParamSchema);
    await next();
  },
  handler.getById
);

// POST /api/v1/examples
exampleRoute.post(
  '/',
  async (c, next) => {
    c.set('body', await parseBody<CreateExampleDTO>(c, createExampleSchema));
    await next();
  },
  handler.create
);

// PUT /api/v1/examples/:id
exampleRoute.put(
  '/:id',
  async (c, next) => {
    parseParam(c, exampleIdParamSchema);
    c.set('body', await parseBody<UpdateExampleDTO>(c, updateExampleSchema));
    await next();
  },
  handler.update
);

// DELETE /api/v1/examples/:id
exampleRoute.delete(
  '/:id',
  async (c, next) => {
    parseParam(c, exampleIdParamSchema);
    await next();
  },
  handler.delete
);
