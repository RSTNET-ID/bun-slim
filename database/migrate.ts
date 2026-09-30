#!/usr/bin/env bun
/**
 * Database Migration Runner
 *
 * Usage:
 *   bun run migrate up       — Jalankan semua migration yang belum diaplikasikan
 *   bun run migrate down     — Rollback migration terakhir
 *   bun run migrate refresh  — down semua lalu up semua (dev only!)
 *   bun run migrate create <name>  — Buat file migration baru
 *   bun run migrate status   — Tampilkan status migration
 *
 * Convention:
 *   File di database/migrations/ menggunakan format:
 *   <timestamp>_<snake_case_name>.ts
 *   dan WAJIB mengeksport fungsi `up(sql)` dan `down(sql)`.
 */

import { SQL } from 'bun';
import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { config } from '../src/config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MigrationModule {
  up: (sql: SQL) => Promise<void>;
  down: (sql: SQL) => Promise<void>;
}

// ─── DB Connection ────────────────────────────────────────────────────────────

const sql = new SQL(config.DATABASE_URL);

// ─── Migration Table ──────────────────────────────────────────────────────────

async function ensureMigrationTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const rows = await sql<{ version: string }[]>`
    SELECT version FROM schema_migrations ORDER BY version ASC
  `;
  return new Set(rows.map((r) => r.version));
}

async function markApplied(version: string): Promise<void> {
  await sql`INSERT INTO schema_migrations (version) VALUES (${version})`;
}

async function markReverted(version: string): Promise<void> {
  await sql`DELETE FROM schema_migrations WHERE version = ${version}`;
}

// ─── Migration Discovery ──────────────────────────────────────────────────────

const MIGRATIONS_DIR = join(import.meta.dir, 'migrations');

async function discoverMigrations(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    .sort();
}

async function loadMigration(filename: string): Promise<MigrationModule> {
  return await import(join(MIGRATIONS_DIR, filename));
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdUp(): Promise<void> {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  const files = await discoverMigrations();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('✅ No pending migrations.');
    return;
  }

  for (const file of pending) {
    console.log(`⬆️  Running migration: ${file}`);
    const mod = await loadMigration(file);
    await mod.up(sql);
    await markApplied(file);
    console.log(`✅ Applied: ${file}`);
  }
}

async function cmdDown(): Promise<void> {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  const files = await discoverMigrations();
  const appliedFiles = files.filter((f) => applied.has(f));

  if (appliedFiles.length === 0) {
    console.log('⚠️  No applied migrations to roll back.');
    return;
  }

  const last = appliedFiles[appliedFiles.length - 1]!;
  console.log(`⬇️  Rolling back: ${last}`);
  const mod = await loadMigration(last);
  await mod.down(sql);
  await markReverted(last);
  console.log(`✅ Reverted: ${last}`);
}

async function cmdRefresh(): Promise<void> {
  console.log('⚠️  REFRESH: Rolling back all migrations then re-applying...');
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  const files = await discoverMigrations();
  const appliedFiles = files.filter((f) => applied.has(f)).reverse();

  for (const file of appliedFiles) {
    console.log(`⬇️  Rolling back: ${file}`);
    const mod = await loadMigration(file);
    await mod.down(sql);
    await markReverted(file);
  }
  await cmdUp();
}

async function cmdCreate(name: string): Promise<void> {
  if (!name) {
    console.error('❌ Usage: bun run migrate create <name>');
    process.exit(1);
  }
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const filename = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}.ts`;
  const filePath = join(MIGRATIONS_DIR, filename);

  const template = `import type { SQL } from 'bun';

export async function up(sql: SQL): Promise<void> {
  // TODO: implement migration
  await sql\`
    -- your SQL here
  \`;
}

export async function down(sql: SQL): Promise<void> {
  // TODO: implement rollback
  await sql\`
    -- your rollback SQL here
  \`;
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
  if (files.length === 0) {
    console.log('  (no migration files found)');
  }
  console.log('─────────────────────────────────────────\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2);

try {
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
      process.exit(1);
  }
} finally {
  await sql.close();
}
