import type { ReservedSQL, SQL } from 'bun';

type MigrationExecutor = SQL | ReservedSQL;

async function indexExists(sql: MigrationExecutor, indexName: string): Promise<boolean> {
  const rows = await sql<{ count: number | string }[]>`
    SELECT COUNT(*) AS count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'examples'
      AND index_name = ${indexName}
  `;

  return Number(rows[0]?.count ?? 0) > 0;
}

export async function up(sql: MigrationExecutor): Promise<void> {
  if (await indexExists(sql, 'idx_examples_status_id')) return;
  await sql`CREATE INDEX idx_examples_status_id ON examples (status, id)`;
}

export async function down(sql: MigrationExecutor): Promise<void> {
  if (!(await indexExists(sql, 'idx_examples_status_id'))) return;
  await sql`DROP INDEX idx_examples_status_id ON examples`;
}
