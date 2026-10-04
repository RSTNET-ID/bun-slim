import type { TransactionSQL } from 'bun';
import { EXAMPLE_CATEGORY_IDS } from '../../src/modules/example/example.constants';

const categories = [
  { id: EXAMPLE_CATEGORY_IDS.GENERAL, name: 'General', code: 'GEN' },
  { id: EXAMPLE_CATEGORY_IDS.TECHNOLOGY, name: 'Technology', code: 'TECH' },
  { id: EXAMPLE_CATEGORY_IDS.FINANCE, name: 'Finance', code: 'FIN' },
] as const;

export async function run(sql: TransactionSQL): Promise<void> {
  for (const category of categories) {
    const rows = await sql<{ id: string }[]>`
      SELECT id
      FROM categories
      WHERE code = ${category.code}
      LIMIT 1
      FOR UPDATE
    `;

    if (rows[0] && rows[0].id !== category.id) {
      throw new Error(
        `Category code ${category.code} already belongs to unexpected id ${rows[0].id}`
      );
    }

    await sql`
      INSERT INTO categories (id, name, code)
      VALUES (${category.id}, ${category.name}, ${category.code})
      ON DUPLICATE KEY UPDATE
        name = ${category.name},
        code = ${category.code},
        updated_at = CURRENT_TIMESTAMP(3)
    `;
  }
}
