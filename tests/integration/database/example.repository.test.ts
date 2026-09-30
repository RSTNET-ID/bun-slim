import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { ExampleRepository } from '@/modules/example/example.repository';
import { closeDbClient, getDbClient } from '@/database/client';

describe('ExampleRepository — PostgreSQL integration', () => {
  const repository = new ExampleRepository();
  const createdIds: string[] = [];

  beforeAll(async () => {
    await getDbClient()`SELECT 1`;
  });

  afterAll(async () => {
    const sql = getDbClient();
    if (createdIds.length > 0) {
      await sql`DELETE FROM examples WHERE id IN ${sql(createdIds)}`;
    }
    await closeDbClient();
  });

  it('should persist, read, partially update, and delete an example', async () => {
    const created = await repository.create({
      name: `integration-${crypto.randomUUID()}`,
      description: 'original',
    });
    createdIds.push(created.id);

    const fetched = await repository.findById(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.description).toBe('original');

    const updated = await repository.update(created.id, { name: 'renamed' });
    expect(updated?.name).toBe('renamed');
    expect(updated?.description).toBe('original');

    const deleted = await repository.delete(created.id);
    expect(deleted).toBe(true);

    const missing = await repository.findById(created.id);
    expect(missing).toBeNull();

    const index = createdIds.indexOf(created.id);
    if (index !== -1) createdIds.splice(index, 1);
  });
});
