#!/usr/bin/env bun
import type { SQL, TransactionSQL } from 'bun';
import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { config } from '../src/config';
import { getDbClient, closeDbClient } from '../src/database/client';

type MigrationExecutor = SQL | TransactionSQL;

interface MigrationModule {
  up: (sql: MigrationExecutor) => Promise<void>;
  down: (sql: MigrationExecutor) => Promise<void>;
}

const MIGRATIONS_DIR = join(import.meta.dir, 'migrations');
const MIGRATION_LOCK_KEY = 'bun-slim-schema-migrations';
const sql = getDbClient();

function assertSupportedDriver(): void {
  if (config.DB_DRIVER !== 'postgres') {
    throw new Error(
      `Migration runner currently supports PostgreSQL only. DB_DRIVER=${config.DB_DRIVER}`
    );
  }
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

async function discoverMigrations(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((file) => file.endsWith('.ts') && !file.startsWith('_')).sort();
}

async function loadMigration(filename: string): Promise<MigrationModule> {
  return await import(join(MIGRATIONS_DIR, filename));
}

async function cmdUp(): Promise<void> {
  await ensureMigrationTable();
  const files = await discoverMigrations();

  for (const file of files) {
    await withMigrationLock(async (tx) => {
      if (await isApplied(file, tx)) return;

      console.log(`⬆️  Running migration: ${file}`);
      const mod = await loadMigration(file);
      await mod.up(tx);
      await markApplied(file, tx);
      console.log(`✅ Applied: ${file}`);
    });
  }

  const applied = await getAppliedMigrations();
  const pending = files.filter((file) => !applied.has(file));
  if (pending.length === 0) console.log('✅ No pending migrations.');
}

async function cmdDown(): Promise<boolean> {
  await ensureMigrationTable();
  const files = await discoverMigrations();

  return await withMigrationLock(async (tx) => {
    const applied = await getAppliedMigrations(tx);
    const appliedFiles = files.filter((file) => applied.has(file));

    if (appliedFiles.length === 0) {
      console.log('⚠️  No applied migrations to roll back.');
      return false;
    }

    const last = appliedFiles[appliedFiles.length - 1]!;
    console.log(`⬇️  Rolling back: ${last}`);
    const mod = await loadMigration(last);
    await mod.down(tx);
    await markReverted(last, tx);
    console.log(`✅ Reverted: ${last}`);
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
  console.log(`✅ Created migration: ${filename}`);
}

async function cmdStatus(): Promise<void> {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  const files = await discoverMigrations();

  console.log('\nMigration Status:');
  console.log('─────────────────────────────────────────');
  for (const file of files) {
    const status = applied.has(file) ? '✅ applied' : '⏳ pending';
    console.log(`  ${status}  ${basename(file)}`);
  }
  if (files.length === 0) console.log('  (no migration files found)');
  console.log('─────────────────────────────────────────\n');
}

const [command, ...args] = process.argv.slice(2);

try {
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
  await closeDbClient();
}
