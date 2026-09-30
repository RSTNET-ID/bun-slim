import { Hono } from 'hono';
import type { AppEnv } from '@/shared/types/context';
import { ExampleHandler } from './example.handler';
import {
  createExampleSchema,
  updateExampleSchema,
  exampleIdParamSchema,
  exampleListQuerySchema,
} from './example.validation';
import { parseBody, parseParam, parseQuery } from '@/shared/http';
import type { CreateExampleDTO, UpdateExampleDTO } from './example.types';

export const exampleRoute = new Hono<AppEnv>();
const handler = new ExampleHandler();

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
