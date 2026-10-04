import { getDbClient } from '@/database/client';
import { runTransaction, type TransactionContext } from '@/database/transaction';
import { EXAMPLE_CATEGORY_IDS } from './example.constants';
import type {
  ExampleItem,
  ExampleWithLookup,
  CategoryItem,
  CreateExampleDTO,
  UpdateExampleDTO,
  ExampleListQuery,
} from './example.types';

const SEED_CATEGORIES = new Map<string, CategoryItem>([
  [
    EXAMPLE_CATEGORY_IDS.GENERAL,
    { id: EXAMPLE_CATEGORY_IDS.GENERAL, name: 'General', code: 'GEN' },
  ],
  [
    EXAMPLE_CATEGORY_IDS.TECHNOLOGY,
    { id: EXAMPLE_CATEGORY_IDS.TECHNOLOGY, name: 'Technology', code: 'TECH' },
  ],
  [
    EXAMPLE_CATEGORY_IDS.FINANCE,
    { id: EXAMPLE_CATEGORY_IDS.FINANCE, name: 'Finance', code: 'FIN' },
  ],
]);

export class ExampleRepository {
  private useInMemory: boolean;
  private _store = new Map<string, ExampleItem>();
  private _categories: Map<string, CategoryItem>;

  constructor(useInMemory = false) {
    this.useInMemory = useInMemory;
    this._categories = new Map(SEED_CATEGORIES);
  }

  async findAllCursor(
    query: ExampleListQuery,
    executor?: TransactionContext
  ): Promise<ExampleItem[]> {
    const limit = query.limit ?? 20;

    if (this.useInMemory) {
      let items = Array.from(this._store.values()).sort((a, b) => a.id.localeCompare(b.id));

      if (query.status) items = items.filter((item) => item.status === query.status);
      if (query.cursor) {
        items = items.filter((item) => item.id.localeCompare(query.cursor!) > 0);
      }
      return items.slice(0, limit + 1);
    }

    const sql = executor || getDbClient();

    if (query.status && query.cursor) {
      return (await sql`
        SELECT id, name, description, status, category_id, created_at, updated_at
        FROM examples
        WHERE status = ${query.status}
          AND id > ${query.cursor}
        ORDER BY id ASC
        LIMIT ${limit + 1}
      `) as unknown as ExampleItem[];
    }

    if (query.status) {
      return (await sql`
        SELECT id, name, description, status, category_id, created_at, updated_at
        FROM examples
        WHERE status = ${query.status}
        ORDER BY id ASC
        LIMIT ${limit + 1}
      `) as unknown as ExampleItem[];
    }

    if (query.cursor) {
      return (await sql`
        SELECT id, name, description, status, category_id, created_at, updated_at
        FROM examples
        WHERE id > ${query.cursor}
        ORDER BY id ASC
        LIMIT ${limit + 1}
      `) as unknown as ExampleItem[];
    }

    return (await sql`
      SELECT id, name, description, status, category_id, created_at, updated_at
      FROM examples
      ORDER BY id ASC
      LIMIT ${limit + 1}
    `) as unknown as ExampleItem[];
  }

  async findById(id: string, executor?: TransactionContext): Promise<ExampleItem | null> {
    if (this.useInMemory) return this._store.get(id) ?? null;

    const sql = executor || getDbClient();
    const rows = (await sql`
      SELECT id, name, description, status, category_id, created_at, updated_at
      FROM examples
      WHERE id = ${id}
      LIMIT 1
    `) as unknown as ExampleItem[];

    return rows[0] ?? null;
  }

  async findByIdWithLookup(
    id: string,
    executor?: TransactionContext
  ): Promise<ExampleWithLookup | null> {
    if (this.useInMemory) {
      const item = this._store.get(id);
      if (!item) return null;
      const category = item.category_id ? (this._categories.get(item.category_id) ?? null) : null;
      return { ...item, category };
    }

    const sql = executor || getDbClient();
    const rows = (await sql`
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
      FROM examples e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.id = ${id}
      LIMIT 1
    `) as unknown as Record<string, unknown>[];

    if (!rows[0]) return null;
    return mapRowWithLookup(rows[0]);
  }

  async create(data: CreateExampleDTO, executor?: TransactionContext): Promise<ExampleItem> {
    if (!this.useInMemory && !executor) {
      return await runTransaction((tx) => this.create(data, tx));
    }

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

    if (this.useInMemory) {
      this._store.set(newItem.id, newItem);
      return newItem;
    }

    const sql = executor!;
    await sql`
      INSERT INTO examples (id, name, description, status, category_id, created_at, updated_at)
      VALUES (
        ${newItem.id},
        ${newItem.name},
        ${newItem.description},
        ${newItem.status},
        ${newItem.category_id},
        ${newItem.created_at},
        ${newItem.updated_at}
      )
    `;

    const created = await this.findById(newItem.id, executor);
    if (!created) throw new Error('Failed to read inserted example from database');
    return created;
  }

  async update(
    id: string,
    data: UpdateExampleDTO,
    executor?: TransactionContext
  ): Promise<ExampleItem | null> {
    if (!this.useInMemory && !executor) {
      return await runTransaction((tx) => this.update(id, data, tx));
    }

    const updatedAt = new Date();

    if (this.useInMemory) {
      const existing = this._store.get(id);
      if (!existing) return null;

      const updated: ExampleItem = {
        ...existing,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.category_id !== undefined ? { category_id: data.category_id } : {}),
        updated_at: updatedAt,
      };
      this._store.set(id, updated);
      return updated;
    }

    const sql = executor!;
    const existing = await sql<{ id: string }[]>`
      SELECT id
      FROM examples
      WHERE id = ${id}
      LIMIT 1
      FOR UPDATE
    `;
    if (!existing[0]) return null;

    const changes: Record<string, unknown> = { updated_at: updatedAt };
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
    if (this.useInMemory) return this._store.delete(id);

    const sql = executor || getDbClient();
    const result = await sql`
      DELETE FROM examples
      WHERE id = ${id}
    `;
    return result.affectedRows === 1;
  }
}

function mapRowWithLookup(row: Record<string, unknown>): ExampleWithLookup {
  const categoryId = row['category__id'] as string | null;
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    description: row['description'] as string | null,
    status: row['status'] as 'active' | 'inactive',
    category_id: row['category_id'] as string | null,
    created_at: row['created_at'] as Date,
    updated_at: row['updated_at'] as Date,
    category: categoryId
      ? {
          id: categoryId,
          name: row['category__name'] as string,
          code: row['category__code'] as string,
        }
      : null,
  };
}
