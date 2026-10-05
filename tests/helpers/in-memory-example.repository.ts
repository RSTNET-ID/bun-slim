import type {
  ExampleItem,
  ExampleWithLookup,
  CategoryItem,
  CreateExampleDTO,
  UpdateExampleDTO,
  ExampleListQuery,
} from '@/modules/example/example.types';
import type { ExampleRepositoryPort } from '@/modules/example/example.repository';

export const TEST_EXAMPLE_CATEGORY_IDS = {
  GENERAL: '00000000-0000-4000-8000-000000000001',
  TECHNOLOGY: '00000000-0000-4000-8000-000000000002',
  FINANCE: '00000000-0000-4000-8000-000000000003',
} as const;

const CATEGORIES = new Map<string, CategoryItem>([
  [
    TEST_EXAMPLE_CATEGORY_IDS.GENERAL,
    { id: TEST_EXAMPLE_CATEGORY_IDS.GENERAL, name: 'General', code: 'GEN' },
  ],
  [
    TEST_EXAMPLE_CATEGORY_IDS.TECHNOLOGY,
    { id: TEST_EXAMPLE_CATEGORY_IDS.TECHNOLOGY, name: 'Technology', code: 'TECH' },
  ],
  [
    TEST_EXAMPLE_CATEGORY_IDS.FINANCE,
    { id: TEST_EXAMPLE_CATEGORY_IDS.FINANCE, name: 'Finance', code: 'FIN' },
  ],
]);

export class InMemoryExampleRepository implements ExampleRepositoryPort {
  private readonly store = new Map<string, ExampleItem>();

  async findAllCursor(query: ExampleListQuery): Promise<ExampleItem[]> {
    const limit = query.limit ?? 20;
    let items = [...this.store.values()].sort((a, b) => a.id.localeCompare(b.id));

    if (query.status) {
      items = items.filter((item) => item.status === query.status);
    }

    const cursor = query.cursor;
    if (cursor) {
      items = items.filter((item) => item.id.localeCompare(cursor) > 0);
    }

    return items.slice(0, limit + 1);
  }

  async findById(id: string): Promise<ExampleItem | null> {
    return this.store.get(id) ?? null;
  }

  async findByIdWithLookup(id: string): Promise<ExampleWithLookup | null> {
    const item = this.store.get(id);
    if (!item) return null;

    return {
      ...item,
      category: item.category_id ? (CATEGORIES.get(item.category_id) ?? null) : null,
    };
  }

  async create(data: CreateExampleDTO): Promise<ExampleItem> {
    const now = new Date();
    const item: ExampleItem = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description ?? null,
      status: 'active',
      category_id: data.category_id ?? null,
      created_at: now,
      updated_at: now,
    };

    this.store.set(item.id, item);
    return item;
  }

  async update(id: string, data: UpdateExampleDTO): Promise<ExampleItem | null> {
    const existing = this.store.get(id);
    if (!existing) return null;

    const updated: ExampleItem = {
      ...existing,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.category_id !== undefined ? { category_id: data.category_id } : {}),
      updated_at: new Date(),
    };

    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
