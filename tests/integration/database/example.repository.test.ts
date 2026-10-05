import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { SQL, TransactionSQL } from 'bun';
import type { TransactionContext } from '@/database/transaction';
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
    let getDbClient: () => SQL;
    let runCategorySeeder: (sql: TransactionSQL) => Promise<void>;
    let runTransaction: <T>(fn: (tx: TransactionContext) => Promise<T>) => Promise<T>;
    const createdIds: string[] = [];

    beforeAll(async () => {
      const repositoryModule = await import('@/modules/example/example.repository');
      const databaseModule = await import('@/database/client');
      const transactionModule = await import('@/database/transaction');
      const seederModule = await import(
        '../../../database/seeders/20240101000000_example_categories.seeder'
      );

      repository = new repositoryModule.ExampleRepository();
      closeDbClient = databaseModule.closeDbClient;
      getDbClient = databaseModule.getDbClient;
      runTransaction = transactionModule.runTransaction;
      runCategorySeeder = seederModule.run;

      await getDbClient()`SELECT 1`;
    });

    afterAll(async () => {
      const sql = getDbClient();
      if (createdIds.length > 0) {
        await sql`DELETE FROM examples WHERE id IN ${sql(createdIds)}`;
      }
      await closeDbClient();
    });

    it('should run the reference category seeder idempotently', async () => {
      const sql = getDbClient();

      await sql.begin((tx) => runCategorySeeder(tx));
      await sql.begin((tx) => runCategorySeeder(tx));

      const rows = await sql<{ code: string; name: string }[]>`
        SELECT code, name
        FROM categories
        WHERE code IN ('GEN', 'TECH', 'FIN')
        ORDER BY code ASC
      `;

      expect(rows).toEqual([
        { code: 'FIN', name: 'Finance' },
        { code: 'GEN', name: 'General' },
        { code: 'TECH', name: 'Technology' },
      ]);
    });

    it('should resolve a category through an explicit JOIN query', async () => {
      const [category] = await getDbClient()<{ id: string }[]>`
        SELECT id
        FROM categories
        WHERE code = 'GEN'
        LIMIT 1
      `;
      expect(category).toBeDefined();

      const created = await repository.create({
        name: `lookup-${crypto.randomUUID()}`,
        category_id: category!.id,
      });
      createdIds.push(created.id);

      const fetched = await repository.findByIdWithLookup(created.id);
      expect(fetched?.category).toMatchObject({
        id: category!.id,
        name: 'General',
        code: 'GEN',
      });
    });

    it('should roll back repository writes when the transaction callback fails', async () => {
      let rolledBackId = '';

      await expect(
        runTransaction(async (tx) => {
          const created = await repository.create(
            { name: `rollback-${crypto.randomUUID()}` },
            tx
          );
          rolledBackId = created.id;
          throw new Error('intentional rollback');
        })
      ).rejects.toThrow('intentional rollback');

      expect(rolledBackId).not.toBe('');
      expect(await repository.findById(rolledBackId)).toBeNull();
    });

    it('should apply status + cursor pagination with Bun.SQL fragments', async () => {
      const first = await repository.create({ name: `page-a-${crypto.randomUUID()}` });
      const second = await repository.create({ name: `page-b-${crypto.randomUUID()}` });
      createdIds.push(first.id, second.id);

      await repository.update(first.id, { status: 'inactive' });
      await repository.update(second.id, { status: 'inactive' });

      const [low, high] = [first.id, second.id].sort();
      const items = await repository.findAllCursor({
        status: 'inactive',
        cursor: low,
        limit: 100,
      });

      expect(items.some((item) => item.id === high)).toBe(true);
      expect(items.every((item) => item.id > low)).toBe(true);
      expect(items.every((item) => item.status === 'inactive')).toBe(true);
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
