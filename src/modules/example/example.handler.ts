import type { Context } from 'hono';
import type { AppEnv } from '@/shared/types/context';
import { ExampleService } from './example.service';
import { sendSuccess, sendCursorPaginated } from '@/shared/http/response';
import type {
  ExampleItem,
  ExampleListQuery,
  CreateExampleDTO,
  UpdateExampleDTO,
} from './example.types';

export class ExampleHandler {
  private service: ExampleService;

  constructor(service: ExampleService = new ExampleService()) {
    this.service = service;
  }

  /**
   * GET /api/v1/examples
   * Cursor-paginated list. Parsed query sudah ada di c.get('listQuery').
   */
  getAll = async (c: Context<AppEnv>) => {
    const query = c.get('listQuery') as ExampleListQuery;
    const items = await this.service.getList(query);

    return sendCursorPaginated<ExampleItem>(
      c,
      items,
      query.limit ?? 20,
      (item) => item.id,
      query.cursor
    );
  };

  /**
   * GET /api/v1/examples/:id
   */
  getById = async (c: Context<AppEnv>) => {
    const id = c.req.param('id') ?? '';
    const item = await this.service.getById(id);
    return sendSuccess(c, item);
  };

  /**
   * GET /api/v1/examples/:id/lookup
   */
  getByIdWithLookup = async (c: Context<AppEnv>) => {
    const id = c.req.param('id') ?? '';
    const item = await this.service.getByIdWithLookup(id);
    return sendSuccess(c, item);
  };

  /**
   * POST /api/v1/examples
   * Parsed body sudah ada di c.get('body').
   */
  create = async (c: Context<AppEnv>) => {
    const body = c.get('body') as CreateExampleDTO;
    const newItem = await this.service.create(body);
    return sendSuccess(c, newItem, 201);
  };

  /**
   * PUT /api/v1/examples/:id
   * Parsed body sudah ada di c.get('body').
   */
  update = async (c: Context<AppEnv>) => {
    const id = c.req.param('id') ?? '';
    const body = c.get('body') as UpdateExampleDTO;
    const updated = await this.service.update(id, body);
    return sendSuccess(c, updated);
  };

  /**
   * DELETE /api/v1/examples/:id
   */
  delete = async (c: Context<AppEnv>) => {
    const id = c.req.param('id') ?? '';
    await this.service.delete(id);
    return sendSuccess(c, { message: `Example ${id} deleted successfully` });
  };
}
