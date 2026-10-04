# 11 - Database Standard

## Default

Branch `main` menggunakan PostgreSQL sebagai database baseline dan `DB_DRIVER` dikunci ke `postgres`. Varian MySQL 8 berada di branch `mysql-v8`.

## Design Goal

Penggantian database tidak boleh memaksa rewrite handler/service.

```text
handler
  -> service
      -> repository
          -> database client
```

Yang harus stabil:
- service contract
- business rules
- API contract

Yang boleh database-specific:
- repository query
- migration
- index strategy
- database-specific data type

Jangan membuat abstraction generik berlebihan hanya untuk mengejar portability teoritis.

## Config

Default:

```env
TZ=UTC
DB_DRIVER=postgres
DATABASE_URL=postgres://user:password@postgres:5432/service_db
DB_POOL_MAX=10
DB_IDLE_TIMEOUT_SECONDS=30
DB_CONNECTION_TIMEOUT_SECONDS=10
DB_MAX_LIFETIME_SECONDS=0
DB_PREPARE=true
```

Future MySQL service dapat menggunakan:

```env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:password@mysql:3306/service_db
```

Repository/migration yang memakai PostgreSQL-specific syntax harus diganti pada database boundary, bukan di handler/service.

## PostgreSQL Baseline

Wajib mempertimbangkan:
- connection pool
- statement/query timeout
- transactions
- explicit indexes
- unique constraints
- idempotency constraints
- graceful close
- health/readiness

## Migration

Migration PostgreSQL dijalankan satu per satu di dalam transaction.

Per migration:

```text
advisory transaction lock
        |
        v
migration.up(tx)
        |
        v
schema_migrations insert
        |
        v
commit
```

Jika migration gagal, schema change dan bookkeeping rollback bersama.

Migration runner PostgreSQL juga memakai advisory lock untuk mengurangi race saat dua instance deployment mencoba migrate bersamaan.

`migrate:refresh` tidak boleh berjalan pada `APP_ENV=production`.

Migration yang sudah pernah diterapkan jangan diedit. Buat migration baru.

## Seeder

Reference/sample data baru menggunakan `database/seed.ts` dan `database/seeders/*.seeder.ts`.

Aturan:
- idempotent dan aman dijalankan ulang
- setiap seeder berjalan dalam transaction
- seluruh run diproteksi PostgreSQL advisory lock
- production membutuhkan `--force`
- migration historis yang sudah pernah diterapkan tidak diedit untuk memindahkan seed
- schema tetap menjadi tanggung jawab migration

Perintah:

```bash
bun run seed
bun run seed:run -- example_categories
bun run seed:create roles
```

## Timezone

Application/scheduler baseline memakai UTC. PostgreSQL production juga harus dikonfigurasi UTC untuk konsistensi server-side `NOW()` dan operational tooling.

## PgBouncer

Bila produksi menggunakan PgBouncer, repository/database layer harus menghindari asumsi session state yang tidak kompatibel dengan mode pooling yang digunakan.

Untuk transaction pooling, `DB_PREPARE=false` adalah baseline aman sampai versi/config PgBouncer aktual diverifikasi mendukung named prepared statement dengan benar.


## TLS

Development/local container boleh menggunakan:

```env
DB_TLS_MODE=disable
```

Staging dan production wajib:

```env
DB_TLS_MODE=verify-full
```

Untuk private/custom CA:

```env
DB_TLS_MODE=verify-full
DB_TLS_CA_FILE=/run/secrets/postgres-ca.pem
```

Bun.SQL meneruskan mode TLS secara eksplisit ke PostgreSQL. Jangan memakai `require` sebagai production baseline karena mode tersebut mengenkripsi transport tetapi tidak memberikan verifikasi hostname penuh.
