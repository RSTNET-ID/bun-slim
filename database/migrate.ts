#!/usr/bin/env bun
import type { ReservedSQL, SQL } from 'bun';
import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { config } from '../src/config';
import { getDbClient, closeDbClient } from '../src/database/client';

type MigrationExecutor = SQL | ReservedSQL;

interface MigrationModule {
  up: (sql: MigrationExecutor) => Promise<void>;
  down: (sql: MigrationExecutor) => Promise<void>;
}

const MIGRATIONS_DIR = join(import.meta.dir, 'migrations');
const MIGRATION_LOCK_KEY = 'bun-slim-schema-migrations';
const sql = getDbClient();

function assertSupportedDriver(): void {
  if (config.DB_DRIVER !== 'mysql') {
    throw new Error(`Migration runner supports MySQL 8 only. DB_DRIVER=${config.DB_DRIVER}`);
  }
}

async function assertMysql8(): Promise<void> {
  const rows = await sql<{ version: string }[]>`SELECT VERSION() AS version`;
  const version = rows[0]?.version ?? '';
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);

  if (/mariadb/i.test(version) || !Number.isInteger(major) || major < 8) {
    throw new Error(`MySQL 8+ is required. Connected server reports version "${version || 'unknown'}"`);
  }
}

async function ensureMigrationTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
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

async function withMigrationLock<T>(fn: (connection: ReservedSQL) => Promise<T>): Promise<T> {
  const connection = await sql.reserve({ signal: AbortSignal.timeout(35_000) });
  let lockAcquired = false;

  try {
    const rows = await connection<{ acquired: number | string | null }[]>`
      SELECT GET_LOCK(${MIGRATION_LOCK_KEY}, 30) AS acquired
    `;
    lockAcquired = Number(rows[0]?.acquired) === 1;

    if (!lockAcquired) {
      throw new Error(`Could not acquire MySQL migration lock: ${MIGRATION_LOCK_KEY}`);
    }

    return await fn(connection);
  } finally {
    if (lockAcquired) {
      const rows = await connection<{ released: number | string | null }[]>`
        SELECT RELEASE_LOCK(${MIGRATION_LOCK_KEY}) AS released
      `;
      if (Number(rows[0]?.released) !== 1) {
        console.warn(`⚠️  MySQL migration lock was not released cleanly: ${MIGRATION_LOCK_KEY}`);
      }
    }
    connection.release();
  }
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
    await withMigrationLock(async (connection) => {
      if (await isApplied(file, connection)) return;

      console.log(`⬆️  Running migration: ${file}`);
      const mod = await loadMigration(file);
      await mod.up(connection);
      await markApplied(file, connection);
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

  return await withMigrationLock(async (connection) => {
    const applied = await getAppliedMigrations(connection);
    const appliedFiles = files.filter((file) => applied.has(file));

    if (appliedFiles.length === 0) {
      console.log('⚠️  No applied migrations to roll back.');
      return false;
    }

    const last = appliedFiles[appliedFiles.length - 1]!;
    console.log(`⬇️  Rolling back: ${last}`);
    const mod = await loadMigration(last);
    await mod.down(connection);
    await markReverted(last, connection);
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
    // MySQL DDL can implicitly commit, so migrations must be retry-safe.
  }
  await cmdUp();
}

async function cmdCreate(name: string): Promise<void> {
  if (!name) {
    console.error('❌ Usage: bun run migrate create <name>');
    process.exitCode = 1;
    return;
  }

  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalizedName) throw new Error('Migration name must contain letters or numbers');

  const filename = `${timestamp}_${normalizedName}.ts`;
  const filePath = join(MIGRATIONS_DIR, filename);
  const template = `import type { ReservedSQL, SQL } from 'bun';

type MigrationExecutor = SQL | ReservedSQL;

export async function up(sql: MigrationExecutor): Promise<void> {
  // TODO: implement retry-safe MySQL 8 migration
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
  if (command !== 'create') await assertMysql8();

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
