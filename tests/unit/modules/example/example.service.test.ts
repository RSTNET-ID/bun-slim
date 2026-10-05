/**
 * Unit Tests — ExampleService
 *
 * Scope: Business logic di ExampleService menggunakan test-only in-memory repository.
 * Tidak ada HTTP, tidak ada DB connection.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  InMemoryExampleRepository,
  TEST_EXAMPLE_CATEGORY_IDS,
} from '../../../helpers/in-memory-example.repository';
import { ExampleService } from '@/modules/example/example.service';
import { NotFoundError } from '@/shared/errors';
import { EXAMPLE_CATEGORY_IDS } from '@/modules/example/example.constants';

describe('ExampleService — unit', () => {
  let repository: InMemoryExampleRepository;
  let service: ExampleService;

  beforeEach(() => {
    repository = new InMemoryExampleRepository();
    service = new ExampleService(repository);
  });

  describe('create', () => {
    it('should create item and return with generated id', async () => {
      const item = await service.create({ name: 'Widget A', description: 'Test' });
      expect(item.id).toBeDefined();
      expect(item.name).toBe('Widget A');
      expect(item.status).toBe('active');
      expect(item.description).toBe('Test');
    });

    it('should create item without optional description', async () => {
      const item = await service.create({ name: 'Minimal' });
      expect(item.description).toBeNull();
    });

    it('should create item with category_id', async () => {
      const item = await service.create({ name: 'With Category', category_id: EXAMPLE_CATEGORY_IDS.GENERAL });
      expect(item.category_id).toBe(EXAMPLE_CATEGORY_IDS.GENERAL);
    });
  });

  describe('getById', () => {
    it('should return existing item', async () => {
      const created = await service.create({ name: 'Fetch Me' });
      const fetched = await service.getById(created.id);
      expect(fetched.name).toBe('Fetch Me');
    });

    it('should throw NotFoundError for non-existent id', async () => {
      await expect(service.getById(crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    });

    it('error message should contain the requested id', async () => {
      const id = crypto.randomUUID();
      await expect(service.getById(id)).rejects.toThrow(id);
    });
  });

  describe('getByIdWithLookup', () => {
    it('should return item with null category when no category_id', async () => {
      const created = await service.create({ name: 'No Category' });
      const result = await service.getByIdWithLookup(created.id);
      expect(result.category).toBeNull();
    });

    it('should return item with resolved category when category_id matches in-memory store', async () => {
      const created = await service.create({ name: 'Has Category', category_id: EXAMPLE_CATEGORY_IDS.GENERAL });
      const result = await service.getByIdWithLookup(created.id);
      expect(result.category).not.toBeNull();
      expect(result.category?.code).toBe('GEN');
    });

    it('should throw NotFoundError for non-existent id', async () => {
      await expect(service.getByIdWithLookup(crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getList (cursor pagination)', () => {
    beforeEach(async () => {
      await service.create({ name: 'Alpha' });
      await service.create({ name: 'Beta' });
      await service.create({ name: 'Gamma' });
    });

    it('should return all items within limit', async () => {
      const items = await service.getList({ limit: 10 });
      expect(items.length).toBeGreaterThanOrEqual(3);
    });

    it('should return limit+1 when has_more = true', async () => {
      const items = await service.getList({ limit: 2 });
      // limit+1 = 3 items dikembalikan untuk deteksi has_more
      expect(items.length).toBe(3);
    });

    it('should filter by status', async () => {
      const created = await service.create({ name: 'Inactive One' });
      await service.update(created.id, { status: 'inactive' });
      const items = await service.getList({ status: 'inactive', limit: 10 });
      expect(items.every((i) => i.status === 'inactive')).toBe(true);
    });
  });

  describe('update', () => {
    it('should update name of existing item', async () => {
      const created = await service.create({ name: 'Old Name' });
      const updated = await service.update(created.id, { name: 'New Name' });
      expect(updated.name).toBe('New Name');
    });

    it('should preserve unchanged fields', async () => {
      const created = await service.create({ name: 'Stable', description: 'Keep me' });
      const updated = await service.update(created.id, { name: 'Changed' });
      expect(updated.description).toBe('Keep me');
    });

    it('should throw NotFoundError when updating non-existent id', async () => {
      await expect(service.update(crypto.randomUUID(), { name: 'X' })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete existing item', async () => {
      const created = await service.create({ name: 'Delete Me' });
      await service.delete(created.id);
      await expect(service.getById(created.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('should throw NotFoundError when deleting non-existent id', async () => {
      await expect(service.delete(crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
