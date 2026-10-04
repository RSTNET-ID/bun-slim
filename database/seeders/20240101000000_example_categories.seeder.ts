import type { TransactionSQL } from 'bun';

const categories = [
  { name: 'General', code: 'GEN' },
  { name: 'Technology', code: 'TECH' },
  { name: 'Finance', code: 'FIN' },
] as const;

export async function run(sql: TransactionSQL): Promise<void> {
  for (const category of categories) {
    await sql`
      INSERT INTO categories (name, code)
      VALUES (${category.name}, ${category.code})
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
    `;
  }
}
