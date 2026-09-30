import { getDbClient } from '@/database/client';
import type { TransactionContext } from '@/database/transaction';
import type {
  ExampleItem,
  ExampleWithLookup,
  CategoryItem,
  CreateExampleDTO,
  UpdateExampleDTO,
  ExampleListQuery,
} from './example.types';

// ─── Static seed data untuk in-memory category lookup ─────────────────────────

const SEED_CATEGORIES = new Map<string, CategoryItem>([
  ['cat-01', { id: 'cat-01', name: 'General', code: 'GEN' }],
  ['cat-02', { id: 'cat-02', name: 'Technology', code: 'TECH' }],
]);

// ─── Repository ───────────────────────────────────────────────────────────────

export class ExampleRepository {
  private useInMemory: boolean;

  /**
   * Instance-level in-memory stores.
   * Masing-masing instance punya store sendiri sehingga test terisolasi.
   */
  private _store = new Map<string, ExampleItem>();
  private _categories: Map<string, CategoryItem>;

  constructor(useInMemory = false) {
    this.useInMemory = useInMemory;
    this._categories = new Map(SEED_CATEGORIES);
  }

  // ── Find All (Cursor Paginated) ─────────────────────────────────────────────

  /**
   * Mengembalikan limit+1 item untuk deteksi `has_more`.
   * Caller (handler via sendCursorPaginated) bertanggung jawab memotong ke limit.
   */
  async findAllCursor(
    query: ExampleListQuery,
    executor?: TransactionContext
  ): Promise<ExampleItem[]> {
    const limit = query.limit ?? 20;

    if (this.useInMemory) {
      let items = Array.from(this._store.values()).sort(
        (a, b) => a.created_at.getTime() - b.created_at.getTime()
      );

      if (query.status) {
        items = items.filter((i) => i.status === query.status);
      }
      if (query.cursor) {
        const idx = items.findIndex((i) => i.id === query.cursor);
        if (idx !== -1) items = items.slice(idx + 1);
      }
      return items.slice(0, limit + 1);
    }

    const sql = executor || getDbClient();
    // Fetch limit+1 untuk has_more detection
    return (await sql`
      SELECT id, name, description, status, category_id, created_at, updated_at
      FROM examples
      WHERE
        (${query.cursor ?? null}::uuid IS NULL OR id > ${query.cursor ?? null}::uuid)
        AND (${query.status ?? null}::text IS NULL OR status = ${query.status ?? null})
      ORDER BY id ASC
      LIMIT ${limit + 1}
    `) as unknown as ExampleItem[];
  }

  // ── Find By ID ─────────────────────────────────────────────────────────────

  async findById(id: string, executor?: TransactionContext): Promise<ExampleItem | null> {
    if (this.useInMemory) {
      return this._store.get(id) ?? null;
    }

    const sql = executor || getDbClient();
    const rows = (await sql`
      SELECT id, name, description, status, category_id, created_at, updated_at
      FROM examples
      WHERE id = ${id}
      LIMIT 1
    `) as unknown as ExampleItem[];
    return rows[0] ?? null;
  }

  // ── Find By ID with Lookup (JOIN category) ─────────────────────────────────

  async findByIdWithLookup(id: string, executor?: TransactionContext): Promise<ExampleWithLookup | null> {
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
        c.id       AS category__id,
        c.name     AS category__name,
        c.code     AS category__code
      FROM examples e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.id = ${id}
      LIMIT 1
    `) as unknown as Record<string, unknown>[];

    if (!rows[0]) return null;
    return mapRowWithLookup(rows[0]);
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(data: CreateExampleDTO, executor?: TransactionContext): Promise<ExampleItem> {
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

    const sql = executor || getDbClient();
    const rows = (await sql`
      INSERT INTO examples (id, name, description, status, category_id, created_at, updated_at)
      VALUES (
        ${newItem.id}, ${newItem.name}, ${newItem.description},
        ${newItem.status}, ${newItem.category_id},
        ${newItem.created_at}, ${newItem.updated_at}
      )
      RETURNING id, name, description, status, category_id, created_at, updated_at
    `) as unknown as ExampleItem[];
    return rows[0]!;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, data: UpdateExampleDTO, executor?: TransactionContext): Promise<ExampleItem | null> {
    const existing = await this.findById(id, executor);
    if (!existing) return null;

    const updated: ExampleItem = {
      ...existing,
      name: data.name ?? existing.name,
      description: data.description !== undefined ? data.description : existing.description,
      status: data.status ?? existing.status,
      category_id: data.category_id !== undefined ? data.category_id : existing.category_id,
      updated_at: new Date(),
    };

    if (this.useInMemory) {
      this._store.set(id, updated);
      return updated;
    }

    const sql = executor || getDbClient();
    const rows = (await sql`
      UPDATE examples
      SET
        name        = ${updated.name},
        description = ${updated.description},
        status      = ${updated.status},
        category_id = ${updated.category_id},
        updated_at  = ${updated.updated_at}
      WHERE id = ${id}
      RETURNING id, name, description, status, category_id, created_at, updated_at
    `) as unknown as ExampleItem[];
    return rows[0] ?? null;
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(id: string, executor?: TransactionContext): Promise<boolean> {
    if (this.useInMemory) {
      return this._store.delete(id);
    }

    const sql = executor || getDbClient();
    const result = (await sql`
      DELETE FROM examples WHERE id = ${id}
    `) as unknown as { count: number };
    // Bun SQL returns rowCount on DML
    return (result as any).count !== 0;
  }
}

// ─── Mapper helper ────────────────────────────────────────────────────────────

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
