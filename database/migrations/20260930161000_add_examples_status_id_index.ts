import type { SQL, TransactionSQL } from 'bun';

type MigrationExecutor = SQL | TransactionSQL;

export async function up(sql: MigrationExecutor): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS idx_examples_status_id
    ON examples (status, id)
  `;
}

export async function down(sql: MigrationExecutor): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_examples_status_id`;
}
