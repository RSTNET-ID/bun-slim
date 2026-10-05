# 13 - Backend Coding Rules

Aturan coding yang harus diikuti oleh semua developer dan coding agent.

---

## 1. Dependency Direction

```text
route → handler → service → repository/adapter
```

- **Route**: hanya deklarasi endpoint dan middleware. Tidak ada business logic.
- **Handler**: HTTP boundary. Baca input, panggil service, map ke response. Tidak ada SQL.
- **Service**: business rules dan orchestration. Tidak ada `Context` dari Hono.
- **Repository**: persistence query saja. Tidak ada business logic.
- **Adapter**: integrasi eksternal (third-party API, messaging, etc).

Dependency **tidak boleh** dibalik.

---

## 2. Error Handling

- Gunakan `AppError` dan subclass-nya (`NotFoundError`, `ValidationError`, dsb) untuk semua kesalahan yang sudah diketahui.
- Lempar exception dari service, tangkap di `globalErrorHandler`.
- **Jangan `catch` tanpa `throw` ulang** jika error tersebut harus diketahui caller:
  ```ts
  // ❌ Salah — error ditelan
  try { await repo.create(data); } catch { return null; }

  // ✅ Benar — biarkan propagate
  await repo.create(data);
  ```
- Repository layer tidak boleh menelan DB error atau fallback ke in-memory store ketika database gagal. Dependency failure harus terlihat oleh caller/health handling.
- Fake/in-memory persistence hanya untuk test dan ditempatkan di `tests/`, bukan sebagai runtime fallback.

---

## 3. Input Validation

- **Semua** input network wajib divalidasi dengan runtime schema (Zod).
- **Struktur File**: Seluruh schema validasi Zod wajib diletakkan secara rapi dalam file terpisah dengan konvensi nama `*.validation.ts` per modul (misalnya `example.validation.ts`).
- Validasi terjadi di **route middleware**, bukan di handler atau service.
- Parse hasil validasi disimpan ke context (`c.set('body', parsed)`) agar handler tidak perlu parse ulang.
- TypeScript type **bukan** validasi runtime.

```ts
// ✅ Import dari file *.validation.ts
import { createExampleSchema } from './example.validation';

// ✅ Validasi di route middleware
route.post('/', async (c, next) => {
  c.set('body', createExampleSchema.parse(await c.req.json()));
  await next();
}, handler.create);

// ✅ Handler baca dari context
create = async (c: Context) => {
  const body = c.get('body') as CreateDTO;
  ...
};
```

---

## 4. Tipe dan Interface

- Gunakan `interface` untuk data shape (DTO, entity, response).
- Gunakan `type` untuk union, intersection, atau alias primitif.
- Hindari `any`. Gunakan `unknown` bila tipe benar-benar tidak diketahui, lalu narrows dengan type guard.
- Export semua public type dari `*.types.ts` per module.

---

## 5. Async & Await

- Selalu gunakan `async/await`, hindari `.then().catch()` chaining.
- Jangan buat `async` function yang tidak `await` apa pun.
- `Promise.all` untuk operasi concurrent yang independen:
  ```ts
  const [a, b] = await Promise.all([fetchA(), fetchB()]);
  ```

---

## 6. Naming Convention

| Konsep | Convention | Contoh |
|---|---|---|
| File | `kebab-case` | `example.service.ts` |
| Validation Schema File | `<module>.validation.ts` | `example.validation.ts` |
| Class | `PascalCase` | `ExampleService` |
| Function/method | `camelCase` | `getById`, `createItem` |
| Constant | `UPPER_SNAKE_CASE` | `MAX_RETRY` |
| Interface | `PascalCase` + noun | `ExampleItem`, `CreateExampleDTO` |
| Boolean variable | `is/has/can` prefix | `isActive`, `hasMore` |
| Repository method | verb + noun | `findById`, `create`, `delete` |
| Service method | verb + noun | `getById`, `create`, `delete` |

---

## 7. Database & Repository

- **Bun.SQL adalah primary database access layer.**
- Jangan membuat ORM internal, custom query builder, fluent SQL DSL, atau generic `BaseRepository<T>` di atas Bun.SQL tanpa kebutuhan nyata yang sudah dibuktikan.
- Repository method **tidak boleh** menerima `Context` dari Hono.
- Production repository hanya berisi persistence logic terhadap database. Fake/in-memory repository untuk unit/contract test harus berada di `tests/`, bukan menjadi fallback mode di production repository.
- Semua query menggunakan **parameterized tagged template literal** Bun native SQL.
- Gunakan typed result generic saat shape row diketahui:

~~~ts
const [row] = await sql<ExampleItem[]>`
  SELECT id, name, status
  FROM examples
  WHERE id = ${id}
  LIMIT 1
`;
~~~

- Untuk filter dinamis, gunakan Bun.SQL fragments daripada membuat query builder:

~~~ts
const statusFilter = status
  ? sql`AND status = ${status}`
  : sql``;

const rows = await sql<ExampleItem[]>`
  SELECT id, name, status
  FROM examples
  WHERE TRUE
    ${statusFilter}
  ORDER BY id ASC
  LIMIT ${limit}
`;
~~~

- Untuk insert/update dinamis, gunakan object helper Bun.SQL:

~~~ts
await sql`
  INSERT INTO examples ${sql({
    id: crypto.randomUUID(),
    name,
    status: 'active',
  })}
`;

await sql`
  UPDATE examples
  SET ${sql(changes)}
  WHERE id = ${id}
`;
~~~

- Jangan interpolasi string mentah ke SQL. Value wajib menjadi parameter, dan dynamic identifier hanya boleh memakai helper identifier Bun.SQL setelah input dibatasi/allowlist.
- Gunakan `runTransaction(fn)` untuk operasi multi-step yang harus atomic. Repository boleh menerima transaction executor agar query tetap memakai API Bun.SQL yang sama di dalam transaction.
- Repository contract/port kecil boleh dibuat bila ada alasan konkret seperti unit test atau boundary inversion. Jangan membuat hierarchy repository generik hanya untuk mengurangi beberapa baris SQL.
- Partial update harus mengubah hanya kolom yang dikirim bila overwrite field lain dapat menyebabkan lost update.
- Index wajib dipertimbangkan untuk pola `WHERE`, `ORDER BY`, dan `JOIN`; buat composite index berdasarkan pola query nyata.
- PostgreSQL boleh memakai `RETURNING` untuk mengembalikan row hasil INSERT/UPDATE/DELETE bila itu menyederhanakan flow.

---
## 8. Cursor Pagination

- Gunakan cursor pagination untuk list endpoint, bukan offset/page.
- Repository mengembalikan **limit+1 items** untuk deteksi `has_more`.
- Handler menggunakan `sendCursorPaginated()` untuk format response standar.
- Cursor default menggunakan `id` dengan `ORDER BY id ASC` agar deterministic dan sama antara test/store implementation. Cursor UUID ini bukan jaminan urutan kronologis. Jika bisnis membutuhkan urutan waktu, gunakan composite cursor seperti `created_at + id`.
- Response shape wajib mengikuti `CursorPaginatedResponse<T>`:
  ```json
  {
    "data": [...],
    "pagination": {
      "next_cursor": "uuid-or-null",
      "prev_cursor": "uuid-or-null",
      "count": 20,
      "limit": 20,
      "has_more": true
    }
  }
  ```

---

## 9. Structured Logging

- Gunakan `logger` dari `@/shared/logger`, bukan `console.log`.
- Selalu sertakan `request_id` dari context bila tersedia.
- Jangan log credential, PII (nama, email, nomor identitas), atau secret.
- Level log:
  - `error`: unhandled exception, unexpected DB error.
  - `warn`: AppError yang diketahui (404, 422, dsb), rate limit hit.
  - `info`: request masuk/keluar, lifecycle event (startup, shutdown).
  - `debug`: detail internal untuk troubleshooting (hanya di development).

---

## 10. Middleware

- Middleware harus bersifat **stateless** kecuali ada alasan konkret (misal: rate limiter).
- Middleware tidak boleh berisi business rule. Hanya cross-cutting concerns.
- Urutan middleware di `app.ts`:
  1. `trimTrailingSlash()` (mengeliminasi masalah 404 akibat trailing slash)
  2. `requestIdMiddleware` (paling awal untuk penjejakan log)
  3. `loggerMiddleware`
  4. domain middleware (auth, rate limit, tenant) di level route
- Middleware yang membutuhkan data dari request harus menyimpan hasilnya ke context dengan `c.set()`.

---

## 11. Testing

- Unit test: business logic/service tanpa HTTP dan tanpa database nyata.
- Contract test: HTTP → handler → service → **test-only fake repository** untuk memvalidasi API contract tanpa database nyata.
- Integration test: repository/transaction terhadap PostgreSQL nyata.
- Setiap test file harus **terisolasi**: gunakan instance baru per `beforeEach`, bukan shared state.
- Cover minimal: success path, validation failure, not found, business failure.
- Beri nama test yang mendeskripsikan behavior, bukan implementasi:
  ```ts
  // ❌ Terlalu teknis
  it('calls repo.findById with correct id')

  // ✅ Behavior-focused
  it('should throw NotFoundError when item does not exist')
  ```

---

## 12. Security

- Semua outbound HTTP request wajib menggunakan timeout.
- Jangan log request body secara penuh di level INFO/DEBUG — bisa mengandung credential.
- Secret hanya berasal dari runtime environment atau mekanisme file-backed `*_FILE` yang didukung; tidak pernah di-hardcode atau dicommit.
- Database credential wajib tersedia melalui `DATABASE_URL` atau `DATABASE_URL_FILE`; tidak boleh ada default credential.
- Gunakan `crypto.randomUUID()` (Bun native) untuk ID generation.

---

## 13. Migration

- Setiap migration wajib mengekspor `up(sql)` dan `down(sql)`.
- `down` harus benar-benar dapat memutar balik perubahan `up`.
- Nama file: `<timestamp_14digit>_<deskripsi_singkat>.ts`.
- PostgreSQL migration dijalankan atomic dalam transaction bersama pencatatan `schema_migrations`.
- Migration runner memakai advisory transaction lock agar deployment paralel tidak mengeksekusi migration yang sama bersamaan.
- `migrate:refresh` dilarang pada `APP_ENV=production`.
- Jangan ubah migration yang sudah diaplikasikan ke production. Buat migration baru.
- Migration baru hanya untuk schema. Reference/sample data baru masuk ke `database/seeders/*.seeder.ts`; jangan edit migration historis untuk memindahkan seed.
- Seeder wajib idempotent dan transactional; production execution membutuhkan `--force`.


---

## 14. Scheduler

- Scheduler menggunakan `Bun.cron()` di process `src/scheduler.ts`, bukan di HTTP server.
- Runtime/database tetap UTC, tetapi cron memakai `SCHEDULER_TIMEZONE` atau `task.timezone` sebagai IANA timezone eksplisit.
- Scheduler menentukan **kapan** pekerjaan dijalankan; worker menangani durable/retryable execution.
- Untuk pekerjaan panjang, retryable, atau punya side effect, scheduler sebaiknya hanya `enqueueJob()`.
- Bun hanya menjamin no-overlap dalam satu process. Baseline production scheduler adalah satu replica.
- Multi-replica scheduler membutuhkan distributed lease/leader election.
- Jangan gunakan `setInterval()` sebagai pengganti calendar scheduling.
- In-process cron tidak menjamin catch-up setelah downtime. Job bisnis yang tidak boleh terlewat harus memiliki durable reconciliation/catch-up strategy.


---

## 15. Transactional Outbox

- Jangan lakukan dual-write `database commit -> enqueue Redis` bila kehilangan job/event dapat membuat business state tidak konsisten.
- Untuk side effect yang wajib mengikuti business write, insert outbox row dalam transaction database yang sama.
- Dispatcher outbox mem-publish secara at-least-once; consumer tetap wajib idempotent.
- Jangan melakukan Redis/network call di dalam transaction DB untuk mencoba membuat atomicity lintas sistem.
- Outbox payload harus versioned, minimal, dan tidak membawa secret.
- Dispatcher wajib batch-bounded, memiliki retry/backoff, stuck-row handling, dan retention policy.
- DLQ replay adalah operasi at-least-once: pertahankan logical `job_id`, reset delivery attempt secara eksplisit, dan worker tetap wajib idempotent.
- DLQ list/purge wajib bounded; destructive purge memerlukan explicit force guard.
- Jangan menampilkan raw DLQ payload secara default karena dapat mengandung business data sensitif.
- Lihat `docs/26-OUTBOX-IDEMPOTENCY-STANDARD.md`.

---

## 16. Build & Binary Execution

- **Wajib berupa Standalone Binary Bun**: Perintah build `bun run build` harus melakukan proses kompilasi native menjadi single standalone binary executable (`bun build --compile --minify ./src/server.ts --outfile dist/server`).
- Output kompilasi diletakkan di dalam folder `dist/` dan di-ignore oleh `.gitignore`.
- Container deployment (Dockerfile) harus mengkompilasi aplikasi melalui stage build dan menjalankan binary `./server` langsung pada runner image tanpa tergantung penafsiran TypeScript runtime saat boot.

---

## 17. Routing & Route Inspection

- **Trailing Slash Normalization**: Seluruh request ke endpoint dengan atau tanpa trailing slash (misal `/health/` vs `/health`) harus berjalan konsisten tanpa mengembalikan 404. Gunakan `trimTrailingSlash()` dari `hono/trailing-slash` pada `app.ts`.
- **Base Root Endpoint Handling**: Base path (seperti `/` dan `/api/v1`) wajib menyediakan handler informasi status/discovery ringan (misal mengembalikan `sendSuccess`) agar tidak mengembalikan 404 saat dipanggil oleh browser atau load balancer.
- **Route Listing Tooling**: Wajib menyediakan script `bun route:list` (`bun scripts/route-list.ts`) yang memanfaatkan `inspectRoutes` dari `hono/dev` untuk menampilkan seluruh daftar route, method, dan middleware yang terdaftar di aplikasi secara jelas.

