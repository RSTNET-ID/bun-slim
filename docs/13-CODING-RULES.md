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
- `catch` yang hanya digunakan untuk fallback (misal: in-memory store saat DB unavailable di dev) harus diberi komentar jelas.
- Repository layer tidak boleh menelan DB error di production path. Silent fallback hanya untuk in-memory test mode.

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

- Repository method **tidak boleh** menerima `Context` dari Hono.
- Semua query menggunakan **tagged template literal** Bun native SQL (`sql\`...\``).
- Jangan interpolasi string mentah ke dalam query — selalu parameterisasi.
  ```ts
  // ❌ SQL injection risk
  await sql`SELECT * FROM examples WHERE name = '${name}'`;

  // ✅ Parameterisasi aman
  await sql`SELECT * FROM examples WHERE name = ${name}`;
  ```
- Gunakan `runTransaction(fn)` untuk operasi multi-step yang harus atomic.
- Index wajib ada untuk kolom yang digunakan di `WHERE`, `ORDER BY`, atau `JOIN`.

---

## 8. Cursor Pagination

- Gunakan cursor pagination untuk list endpoint, bukan offset/page.
- Repository mengembalikan **limit+1 items** untuk deteksi `has_more`.
- Handler menggunakan `sendCursorPaginated()` untuk format response standar.
- Cursor default menggunakan `id` (UUID, bertipe `ORDER BY id ASC`).
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

- Unit test: hanya business logic di service, tidak ada HTTP, tidak ada DB.
- Integration test: end-to-end HTTP → in-memory repository. Validasi contract API.
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
- Secret hanya dibaca dari environment variable, tidak pernah di-hardcode.
- `DATABASE_URL` wajib ada di semua environment — tidak boleh ada default value.
- Gunakan `crypto.randomUUID()` (Bun native) untuk ID generation.

---

## 13. Migration

- Setiap migration wajib mengeksport `up(sql)` dan `down(sql)`.
- `down` harus benar-benar dapat memutar balik perubahan `up`.
- Nama file: `<timestamp_14digit>_<deskripsi_singkat>.ts`.
- Jangan ubah migration yang sudah diaplikasikan ke production. Buat migration baru.
- Seed data untuk referensi (categories, config) masuk di migration, bukan di service.

---

## 14. Build & Binary Execution

- **Wajib berupa Standalone Binary Bun**: Perintah build `bun run build` harus melakukan proses kompilasi native menjadi single standalone binary executable (`bun build --compile --minify ./src/server.ts --outfile dist/server`).
- Output kompilasi diletakkan di dalam folder `dist/` dan di-ignore oleh `.gitignore`.
- Container deployment (Dockerfile) harus mengkompilasi aplikasi melalui stage build dan menjalankan binary `./server` langsung pada runner image tanpa tergantung penafsiran TypeScript runtime saat boot.

---

## 15. Routing & Route Inspection

- **Trailing Slash Normalization**: Seluruh request ke endpoint dengan atau tanpa trailing slash (misal `/health/` vs `/health`) harus berjalan konsisten tanpa mengembalikan 404. Gunakan `trimTrailingSlash()` dari `hono/trailing-slash` pada `app.ts`.
- **Base Root Endpoint Handling**: Base path (seperti `/` dan `/api/v1`) wajib menyediakan handler informasi status/discovery ringan (misal mengembalikan `sendSuccess`) agar tidak mengembalikan 404 saat dipanggil oleh browser atau load balancer.
- **Route Listing Tooling**: Wajib menyediakan script `bun route:list` (`bun scripts/route-list.ts`) yang memanfaatkan `inspectRoutes` dari `hono/dev` untuk menampilkan seluruh daftar route, method, dan middleware yang terdaftar di aplikasi secara jelas.

