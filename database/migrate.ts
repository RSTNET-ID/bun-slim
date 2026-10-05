#!/usr/bin/env bun
import type { SQL, TransactionSQL } from 'bun';
import { join } from 'node:path';
import { config } from '../src/config';
import { createDbClient } from '../src/database/client';
import { migrations } from './migrations/registry';
import { regenerateMigrationRegistry } from './registry-generator';

type MigrationExecutor = SQL | TransactionSQL;

interface MigrationModule {
  up: (sql: MigrationExecutor) => Promise<void>;
  down: (sql: MigrationExecutor) => Promise<void>;
}

const MIGRATIONS_DIR = join(import.meta.dir, 'migrations');
const MIGRATION_LOCK_KEY = 'bun-slim-schema-migrations';
const sql = createDbClient(config.MIGRATION_DATABASE_URL ?? config.DATABASE_URL);

function assertSupportedDriver(): void {
  if (config.DB_DRIVER !== 'postgres') {
    throw new Error(
      `Migration runner currently supports PostgreSQL only. DB_DRIVER=${config.DB_DRIVER}`
    );
  }
}

function asMigrationModule(entry: (typeof migrations)[number]): MigrationModule {
  return entry as unknown as MigrationModule;
}

async function ensureMigrationTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function getAppliedMigrations(executor: MigrationExecutor = sql): Promise<Set<string>> {
  const rows = await executor<{ version: string }[]>`
    SELECT version FROM schema_migrations ORDER BY version ASC
  `;
  return new Set(rows.map((row) => row.version));
}

async function isApplied(version: string, executor: MigrationExecutor): Promise<boolean> {
  const rows = await executor<{ version: string }[]>`
    SELECT version FROM schema_migrations WHERE version = ${version} LIMIT 1
  `;
  return rows.length === 1;
}

async function markApplied(version: string, executor: MigrationExecutor): Promise<void> {
  await executor`INSERT INTO schema_migrations (version) VALUES (${version})`;
}

async function markReverted(version: string, executor: MigrationExecutor): Promise<void> {
  await executor`DELETE FROM schema_migrations WHERE version = ${version}`;
}

async function withMigrationLock<T>(fn: (tx: TransactionSQL) => Promise<T>): Promise<T> {
  return await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${MIGRATION_LOCK_KEY}))`;
    return await fn(tx);
  });
}

async function cmdUp(): Promise<void> {
  await ensureMigrationTable();

  for (const entry of migrations) {
    await withMigrationLock(async (tx) => {
      if (await isApplied(entry.version, tx)) return;

      console.log(`⬆️  Running migration: ${entry.version}`);
      const migration = asMigrationModule(entry);
      await migration.up(tx);
      await markApplied(entry.version, tx);
      console.log(`✅ Applied: ${entry.version}`);
    });
  }

  const applied = await getAppliedMigrations();
  const pending = migrations.filter((entry) => !applied.has(entry.version));
  if (pending.length === 0) console.log('✅ No pending migrations.');
}

async function cmdDown(): Promise<boolean> {
  await ensureMigrationTable();

  return await withMigrationLock(async (tx) => {
    const applied = await getAppliedMigrations(tx);
    const appliedEntries = migrations.filter((entry) => applied.has(entry.version));

    if (appliedEntries.length === 0) {
      console.log('⚠️  No applied migrations to roll back.');
      return false;
    }

    const last = appliedEntries[appliedEntries.length - 1]!;
    console.log(`⬇️  Rolling back: ${last.version}`);
    const migration = asMigrationModule(last);
    await migration.down(tx);
    await markReverted(last.version, tx);
    console.log(`✅ Reverted: ${last.version}`);
    return true;
  });
}

async function cmdRefresh(): Promise<void> {
  if (config.APP_ENV === 'production') {
    throw new Error('migrate refresh is disabled in production');
  }

  console.log('⚠️  REFRESH: Rolling back all migrations then re-applying...');
  while (await cmdDown()) {
    // Roll back one atomic migration at a time.
  }
  await cmdUp();
}

async function cmdCreate(name: string): Promise<void> {
  if (!name) {
    console.error('❌ Usage: bun run migrate create <name>');
    process.exitCode = 1;
    return;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14);
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalizedName) throw new Error('Migration name must contain letters or numbers');

  const filename = `${timestamp}_${normalizedName}.ts`;
  const filePath = join(MIGRATIONS_DIR, filename);
  const template = `import type { SQL, TransactionSQL } from 'bun';

type MigrationExecutor = SQL | TransactionSQL;

export async function up(sql: MigrationExecutor): Promise<void> {
  // TODO: implement migration
}

export async function down(sql: MigrationExecutor): Promise<void> {
  // TODO: implement rollback
}
`;

  await Bun.write(filePath, template);
  await regenerateMigrationRegistry();
  console.log(`✅ Created migration and refreshed registry: ${filename}`);
}

async function cmdStatus(): Promise<void> {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();

  console.log('\nMigration Status:');
  console.log('─────────────────────────────────────────');
  for (const entry of migrations) {
    const status = applied.has(entry.version) ? '✅ applied' : '⏳ pending';
    console.log(`  ${status}  ${entry.version}`);
  }
  if (migrations.length === 0) console.log('  (no migrations registered)');
  console.log('─────────────────────────────────────────\n');
}

const [command, ...args] = process.argv.slice(2);

function assertProductionMigrationCommandAllowed(): void {
  if (config.APP_ENV !== 'production') return;

  if (command === 'create') {
    throw new Error('migrate create is disabled in production');
  }

  if (command === 'down' && !args.includes('--force')) {
    throw new Error('Production migrate down requires --force');
  }
}

try {
  assertProductionMigrationCommandAllowed();
  assertSupportedDriver();

  switch (command) {
    case 'up':
      await cmdUp();
      break;
    case 'down':
      await cmdDown();
      break;
    case 'refresh':
      await cmdRefresh();
      break;
    case 'create':
      await cmdCreate(args.join(' '));
      break;
    case 'status':
      await cmdStatus();
      break;
    default:
      console.error(`❌ Unknown command: "${command}"`);
      console.error('Available: up | down | refresh | create <name> | status');
      process.exitCode = 1;
  }
} finally {
  await sql.close({ timeout: 5 });
}
