import { NotFoundError } from '@/shared/errors';
import { ExampleRepository } from './example.repository';
import type {
  ExampleItem,
  ExampleWithLookup,
  CreateExampleDTO,
  UpdateExampleDTO,
  ExampleListQuery,
} from './example.types';

export class ExampleService {
  private repository: ExampleRepository;

  constructor(repository: ExampleRepository = new ExampleRepository()) {
    this.repository = repository;
  }

  /**
   * Mengembalikan list dengan limit+1 items untuk has_more detection.
   * Gunakan sendCursorPaginated() di handler untuk format response.
   */
  async getList(query: ExampleListQuery): Promise<ExampleItem[]> {
    return await this.repository.findAllCursor(query);
  }

  async getById(id: string): Promise<ExampleItem> {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new NotFoundError(`Example with ID ${id} not found`);
    }
    return item;
  }

  /**
   * Get by ID dengan lookup category (JOIN).
   */
  async getByIdWithLookup(id: string): Promise<ExampleWithLookup> {
    const item = await this.repository.findByIdWithLookup(id);
    if (!item) {
      throw new NotFoundError(`Example with ID ${id} not found`);
    }
    return item;
  }

  async create(data: CreateExampleDTO): Promise<ExampleItem> {
    return await this.repository.create(data);
  }

  async update(id: string, data: UpdateExampleDTO): Promise<ExampleItem> {
    const updated = await this.repository.update(id, data);
    if (!updated) {
      throw new NotFoundError(`Example with ID ${id} not found`);
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) {
      throw new NotFoundError(`Example with ID ${id} not found`);
    }
  }
}
