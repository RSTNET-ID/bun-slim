import type { TransactionSQL } from 'bun';
import { getDbClient } from './client';

export type TransactionContext = TransactionSQL;

/**
 * Jalankan fungsi `fn` dalam satu database transaction.
 *
 * Bun.SQL akan commit saat callback selesai dan rollback bila callback throw.
 * Repository dapat menerima TransactionContext agar seluruh query menggunakan
 * dedicated transaction connection yang sama.
 */
export async function runTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
  return await getDbClient().begin(async (tx) => fn(tx));
}
