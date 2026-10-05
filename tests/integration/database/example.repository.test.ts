import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { SQL } from 'bun';
import { EXAMPLE_CATEGORY_IDS } from '@/modules/example/example.constants';
import type { ExampleRepository } from '@/modules/example/example.repository';
import type { TransactionContext } from '@/database/transaction';

const runMysqlIntegration = process.env.RUN_MYSQL_INTEGRATION === 'true';

if (!runMysqlIntegration) {
  describe.skip('ExampleRepository — MySQL 8 integration', () => {
    it('requires RUN_MYSQL_INTEGRATION=true', () => {});
  });
} else {
  describe('ExampleRepository — MySQL 8 integration', () => {
    let repository: ExampleRepository;
    let closeDbClient: () => Promise<void>;
    let getDbClient: () => SQL;
    let runTransaction: <T>(
      fn: (tx: TransactionContext) => Promise<T>
    ) => Promise<T>;
    let runCategorySeeder: (sql: TransactionContext) => Promise<void>;
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

      const rows = await getDbClient()<{ version: string }[]>`SELECT VERSION() AS version`;
      const version = rows[0]?.version ?? '';
      expect(version.toLowerCase()).not.toContain('mariadb');
      expect(Number.parseInt(version.split('.')[0] ?? '', 10)).toBeGreaterThanOrEqual(8);
    });

    afterAll(async () => {
      const sql = getDbClient();
      if (createdIds.length > 0) {
        await sql`DELETE FROM examples WHERE id IN ${sql(createdIds)}`;
      }
      await closeDbClient();
    });

    it('should keep the MySQL application session in UTC', async () => {
      const rows = await getDbClient()<{
        session_time_zone: string;
      }[]>`SELECT @@SESSION.time_zone AS session_time_zone`;

      expect(rows[0]?.session_time_zone).toBe('+00:00');
    });

    it('should run the reference category seeder idempotently', async () => {
      await runTransaction((tx) => runCategorySeeder(tx));
      await runTransaction((tx) => runCategorySeeder(tx));

      const sql = getDbClient();
      const ids = Object.values(EXAMPLE_CATEGORY_IDS);
      const rows = await sql<{ id: string; name: string; code: string }[]>`
        SELECT id, name, code
        FROM categories
        WHERE id IN ${sql(ids)}
        ORDER BY code ASC
      `;

      expect(rows).toEqual([
        { id: EXAMPLE_CATEGORY_IDS.FINANCE, name: 'Finance', code: 'FIN' },
        { id: EXAMPLE_CATEGORY_IDS.GENERAL, name: 'General', code: 'GEN' },
        { id: EXAMPLE_CATEGORY_IDS.TECHNOLOGY, name: 'Technology', code: 'TECH' },
      ]);
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

    it('should resolve the seeded category IDs through the JOIN query', async () => {
      const created = await repository.create({
        name: `lookup-${crypto.randomUUID()}`,
        category_id: EXAMPLE_CATEGORY_IDS.GENERAL,
      });
      createdIds.push(created.id);

      const fetched = await repository.findByIdWithLookup(created.id);
      expect(fetched?.category).toEqual({
        id: EXAMPLE_CATEGORY_IDS.GENERAL,
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

    it('should apply status + cursor pagination with deterministic ordering', async () => {
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
  });
}
