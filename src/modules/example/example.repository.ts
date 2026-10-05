import type { SQL } from 'bun';
import { getDbClient } from '@/database/client';
import { runTransaction, type TransactionContext } from '@/database/transaction';
import type {
  ExampleItem,
  ExampleWithLookup,
  CreateExampleDTO,
  UpdateExampleDTO,
  ExampleListQuery,
} from './example.types';

type DbExecutor = SQL | TransactionContext;

interface ExampleLookupRow extends ExampleItem {
  category__id: string | null;
  category__name: string | null;
  category__code: string | null;
}

export class ExampleRepository {
  constructor(private readonly db: SQL = getDbClient()) {}

  /**
   * Mengembalikan limit+1 item untuk deteksi has_more.
   * Filter opsional dibangun dengan Bun.SQL fragments, bukan custom query builder.
   */
  async findAllCursor(
    query: ExampleListQuery,
    executor?: TransactionContext
  ): Promise<ExampleItem[]> {
    const sql: DbExecutor = executor ?? this.db;
    const limit = query.limit ?? 20;
    const cursorFilter = query.cursor
      ? sql`AND id > ${query.cursor}`
      : sql``;
    const statusFilter = query.status
      ? sql`AND status = ${query.status}`
      : sql``;

    return await sql<ExampleItem[]>`
      SELECT
        id,
        name,
        description,
        status,
        category_id,
        created_at,
        updated_at
      FROM examples
      WHERE TRUE
        ${cursorFilter}
        ${statusFilter}
      ORDER BY id ASC
      LIMIT ${limit + 1}
    `;
  }

  async findById(
    id: string,
    executor?: TransactionContext
  ): Promise<ExampleItem | null> {
    const sql: DbExecutor = executor ?? this.db;
    const [row] = await sql<ExampleItem[]>`
      SELECT
        id,
        name,
        description,
        status,
        category_id,
        created_at,
        updated_at
      FROM examples
      WHERE id = ${id}
      LIMIT 1
    `;

    return row ?? null;
  }

  async findByIdWithLookup(
    id: string,
    executor?: TransactionContext
  ): Promise<ExampleWithLookup | null> {
    const sql: DbExecutor = executor ?? this.db;
    const [row] = await sql<ExampleLookupRow[]>`
      SELECT
        e.id,
        e.name,
        e.description,
        e.status,
        e.category_id,
        e.created_at,
        e.updated_at,
        c.id AS category__id,
        c.name AS category__name,
        c.code AS category__code
      FROM examples AS e
      LEFT JOIN categories AS c ON c.id = e.category_id
      WHERE e.id = ${id}
      LIMIT 1
    `;

    return row ? mapRowWithLookup(row) : null;
  }

  async create(
    data: CreateExampleDTO,
    executor?: TransactionContext
  ): Promise<ExampleItem> {
    if (!executor) {
      return await runTransaction((tx) => this.create(data, tx));
    }

    const sql: DbExecutor = executor;
    const now = new Date();
    const newItem: ExampleItem = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description ?? null,
      status: 'active',
      category_id: data.category_id ?? null,
      created_at: now,
      updated_at: now,
    };

    await sql`
      INSERT INTO examples ${sql(newItem)}
    `;

    const created = await this.findById(newItem.id, executor);
    if (!created) {
      throw new Error('Failed to read inserted example from database');
    }

    return created;
  }

  async update(
    id: string,
    data: UpdateExampleDTO,
    executor?: TransactionContext
  ): Promise<ExampleItem | null> {
    if (!executor) {
      return await runTransaction((tx) => this.update(id, data, tx));
    }

    const sql: DbExecutor = executor;
    const [existing] = await sql<{ id: string }[]>`
      SELECT id
      FROM examples
      WHERE id = ${id}
      LIMIT 1
      FOR UPDATE
    `;

    if (!existing) {
      return null;
    }

    const changes: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) changes.name = data.name;
    if (data.description !== undefined) changes.description = data.description;
    if (data.status !== undefined) changes.status = data.status;
    if (data.category_id !== undefined) changes.category_id = data.category_id;

    await sql`
      UPDATE examples
      SET ${sql(changes)}
      WHERE id = ${id}
    `;

    return await this.findById(id, executor);
  }

  async delete(id: string, executor?: TransactionContext): Promise<boolean> {
    const sql: DbExecutor = executor ?? this.db;
    const result = await sql`
      DELETE FROM examples
      WHERE id = ${id}
    `;

    return result.affectedRows === 1;
  }
}

export type ExampleRepositoryPort = Pick<
  ExampleRepository,
  'findAllCursor' | 'findById' | 'findByIdWithLookup' | 'create' | 'update' | 'delete'
>;

function mapRowWithLookup(row: ExampleLookupRow): ExampleWithLookup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    category_id: row.category_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category: row.category__id
      ? {
          id: row.category__id,
          name: row.category__name ?? '',
          code: row.category__code ?? '',
        }
      : null,
  };
}
