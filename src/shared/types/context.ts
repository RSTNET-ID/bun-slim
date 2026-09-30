import type { ExampleListQuery } from '@/modules/example/example.types';

/**
 * Hono AppEnv — mendefinisikan tipe semua variabel yang disimpan ke Context via c.set().
 *
 * Setiap module yang membutuhkan custom context variables harus:
 * 1. Tambahkan key-value ke interface `Variables` di sini.
 * 2. Gunakan `Hono<AppEnv>` saat membuat Hono instance.
 * 3. `c.get('key')` akan mendapat tipe yang benar tanpa casting manual.
 */

export interface Variables {
  requestId: string;
  /** Pre-parsed list query dari route middleware */
  listQuery: ExampleListQuery;
  /** Pre-parsed request body dari route middleware */
  body: unknown;
}

export type AppEnv = {
  Variables: Variables;
};
