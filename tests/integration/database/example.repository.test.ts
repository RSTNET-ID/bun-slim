import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { ExampleRepository } from '@/modules/example/example.repository';

const runPostgresIntegration = process.env.RUN_POSTGRES_INTEGRATION === 'true';

if (!runPostgresIntegration) {
  describe.skip('ExampleRepository — PostgreSQL integration', () => {
    it('requires RUN_POSTGRES_INTEGRATION=true', () => {});
  });
} else {
  describe('ExampleRepository — PostgreSQL integration', () => {
    let repository: ExampleRepository;
    let closeDbClient: () => Promise<void>;
    let getDbClient: typeof import('@/database/client').getDbClient;
    const createdIds: string[] = [];

    beforeAll(async () => {
      const repositoryModule = await import('@/modules/example/example.repository');
      const databaseModule = await import('@/database/client');

      repository = new repositoryModule.ExampleRepository();
      closeDbClient = databaseModule.closeDbClient;
      getDbClient = databaseModule.getDbClient;

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
}
