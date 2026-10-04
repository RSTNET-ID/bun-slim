#!/usr/bin/env bun
import type { ReservedSQL, TransactionSQL } from 'bun';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { config } from '../src/config';
import { closeDbClient, getDbClient } from '../src/database/client';

interface SeederModule {
  run: (sql: TransactionSQL) => Promise<void>;
}

const SEEDERS_DIR = join(import.meta.dir, 'seeders');
const SEED_LOCK_KEY = 'bun-slim-database-seeders';
const sql = getDbClient();

function assertSupportedDriver(): void {
  if (config.DB_DRIVER !== 'postgres') {
    throw new Error(`Seeder runner supports PostgreSQL only. DB_DRIVER=${config.DB_DRIVER}`);
  }
}

async function withSeederLock<T>(fn: (connection: ReservedSQL) => Promise<T>): Promise<T> {
  const connection = await sql.reserve({ signal: AbortSignal.timeout(35_000) });
  let lockAcquired = false;

  try {
    await connection`
      SELECT pg_advisory_lock(hashtextextended(${SEED_LOCK_KEY}, 0))
    `;
    lockAcquired = true;
    return await fn(connection);
  } finally {
    if (lockAcquired) {
      await connection`
        SELECT pg_advisory_unlock(hashtextextended(${SEED_LOCK_KEY}, 0))
      `;
    }
    connection.release();
  }
}

async function discoverSeeders(): Promise<string[]> {
  const files = await readdir(SEEDERS_DIR);
  return files.filter((file) => file.endsWith('.seeder.ts') && !file.startsWith('_')).sort();
}

async function loadSeeder(filename: string): Promise<SeederModule> {
  return await import(join(SEEDERS_DIR, filename));
}

function selectSeeders(files: string[], name?: string): string[] {
  if (!name) return files;

  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return files.filter((file) => {
    const candidate = basename(file, '.seeder.ts').toLowerCase();
    return candidate === normalized || candidate.endsWith(`_${normalized}`);
  });
}

async function runSeeders(name?: string, force = false): Promise<void> {
  if (config.APP_ENV === 'production' && !force) {
    throw new Error('Production seeding requires --force');
  }

  const files = selectSeeders(await discoverSeeders(), name);
  if (name && files.length === 0) {
    throw new Error(`Seeder not found: ${name}`);
  }

  await withSeederLock(async (connection) => {
    for (const file of files) {
      console.log(`🌱 Running seeder: ${file}`);
      const mod = await loadSeeder(file);
      await connection.begin(async (tx) => {
        await mod.run(tx);
      });
      console.log(`✅ Seeded: ${file}`);
    }
  });

  if (files.length === 0) {
    console.log('✅ No seeders found.');
  }
}

async function createSeeder(name: string): Promise<void> {
  if (!name) {
    throw new Error('Usage: bun run seed:create <name>');
  }

  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalizedName) {
    throw new Error('Seeder name must contain letters or numbers');
  }

  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const filename = `${timestamp}_${normalizedName}.seeder.ts`;
  const filePath = join(SEEDERS_DIR, filename);
  const template = `import type { TransactionSQL } from 'bun';

export async function run(sql: TransactionSQL): Promise<void> {
  // TODO: implement idempotent seed data
}
`;

  await Bun.write(filePath, template);
  console.log(`✅ Created seeder: ${filename}`);
}

const [command = 'run', ...args] = process.argv.slice(2);
const force = args.includes('--force');
const positionalArgs = args.filter((arg) => arg !== '--force' && arg !== '--');

try {
  assertSupportedDriver();

  switch (command) {
    case 'run':
      await runSeeders(positionalArgs[0], force);
      break;
    case 'create':
      await createSeeder(positionalArgs.join(' '));
      break;
    default:
      throw new Error(`Unknown command: "${command}". Available: run [name] [--force] | create <name>`);
  }
} finally {
  await closeDbClient();
}
