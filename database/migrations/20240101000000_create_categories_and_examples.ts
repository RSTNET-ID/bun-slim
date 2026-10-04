import type { ReservedSQL, SQL } from 'bun';

type MigrationExecutor = SQL | ReservedSQL;

export async function up(sql: MigrationExecutor): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      code       VARCHAR(20) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT uq_categories_code UNIQUE (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS examples (
      id          CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      description TEXT NULL,
      status      ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      category_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_examples_category
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      INDEX idx_examples_status (status),
      INDEX idx_examples_category_id (category_id),
      INDEX idx_examples_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `;

  // Legacy baseline reference data. Keep this historical migration immutable.
  // New reference/sample data belongs in database/seeders.
  await sql`
    INSERT INTO categories (id, name, code) VALUES
      ('00000000-0000-4000-8000-000000000001', 'General', 'GEN'),
      ('00000000-0000-4000-8000-000000000002', 'Technology', 'TECH'),
      ('00000000-0000-4000-8000-000000000003', 'Finance', 'FIN')
    ON DUPLICATE KEY UPDATE code = categories.code
  `;
}

export async function down(sql: MigrationExecutor): Promise<void> {
  await sql`DROP TABLE IF EXISTS examples`;
  await sql`DROP TABLE IF EXISTS categories`;
}
