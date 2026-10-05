#!/usr/bin/env bun
import type { ReservedSQL } from 'bun';
import { join } from 'node:path';
import { config } from '../src/config';
import { closeDbClient, getDbClient } from '../src/database/client';
import { seeders } from './seeders/registry';
import { regenerateSeederRegistry } from './registry-generator';

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

function selectSeeders(name?: string): Array<(typeof seeders)[number]> {
  if (!name) return [...seeders];

  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return seeders.filter((entry) => {
    const candidate = entry.filename.replace(/\.seeder\.ts$/, '').toLowerCase();
    return candidate === normalized || candidate.endsWith(`_${normalized}`);
  });
}

async function runSeeders(name?: string, force = false): Promise<void> {
  if (config.APP_ENV === 'production' && !force) {
    throw new Error('Production seeding requires --force');
  }

  const selected = selectSeeders(name);
  if (name && selected.length === 0) {
    throw new Error(`Seeder not found: ${name}`);
  }

  await withSeederLock(async (connection) => {
    for (const entry of selected) {
      console.log(`🌱 Running seeder: ${entry.filename}`);
      await connection.begin(async (tx) => {
        await entry.run(tx);
      });
      console.log(`✅ Seeded: ${entry.filename}`);
    }
  });

  if (selected.length === 0) {
    console.log('✅ No seeders registered.');
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
  await regenerateSeederRegistry();
  console.log(`✅ Created seeder and refreshed registry: ${filename}`);
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
