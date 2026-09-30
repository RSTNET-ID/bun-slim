import type { SQL } from 'bun';
import { getDbClient } from './client';

export type TransactionContext = SQL;

interface BunSqlTransaction {
  begin<T>(cb: (tx: SQL) => Promise<T>): Promise<T>;
}

/**
 * Jalankan fungsi `fn` dalam satu database transaction.
 *
 * Bun native SQL mengekspos `.begin()` di instance SQL-nya.
 * Callback menerima `tx` bertipe SQL yang sama sehingga repository
 * tidak perlu tahu apakah ia berjalan di dalam transaksi atau tidak.
 *
 * Contoh:
 *   const result = await runTransaction(async (tx) => {
 *     await exampleRepo.create(data, tx);
 *     await auditRepo.log(event, tx);
 *     return result;
 *   });
 */
export async function runTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
  const sql = getDbClient();
  const txSql = sql as unknown as BunSqlTransaction;
  return await txSql.begin((tx: SQL) => fn(tx));
}
