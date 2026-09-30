import type { SQL } from 'bun';

/**
 * Migration: 20240101000000_create_categories_and_examples
 *
 * Membuat tabel categories dan examples dengan:
 * - UUID primary key (gen_random_uuid())
 * - FK categories → examples
 * - Indexes untuk query umum
 * - Updated_at trigger
 */

export async function up(sql: SQL): Promise<void> {
  // 1. Extension untuk UUID generation
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;

  // 2. Tabel categories (lookup table)
  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(100) NOT NULL,
      code       VARCHAR(20)  NOT NULL UNIQUE,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_categories_code ON categories (code)`;

  // 3. Tabel examples
  await sql`
    CREATE TABLE IF NOT EXISTS examples (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR(100) NOT NULL,
      description TEXT,
      status      VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      category_id UUID         REFERENCES categories(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_examples_status ON examples (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_examples_category_id ON examples (category_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_examples_created_at ON examples (created_at)`;

  // 4. Trigger updated_at otomatis
  await sql`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$
  `;

  for (const table of ['categories', 'examples']) {
    await sql.unsafe(`
      CREATE OR REPLACE TRIGGER trg_${table}_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
  }

  // 5. Seed data categories
  await sql`
    INSERT INTO categories (id, name, code) VALUES
      (gen_random_uuid(), 'General',    'GEN'),
      (gen_random_uuid(), 'Technology', 'TECH'),
      (gen_random_uuid(), 'Finance',    'FIN')
    ON CONFLICT (code) DO NOTHING
  `;
}

export async function down(sql: SQL): Promise<void> {
  // Hapus dalam urutan terbalik dependency
  await sql`DROP TABLE IF EXISTS examples CASCADE`;
  await sql`DROP TABLE IF EXISTS categories CASCADE`;
  await sql`DROP FUNCTION IF EXISTS set_updated_at CASCADE`;
}
