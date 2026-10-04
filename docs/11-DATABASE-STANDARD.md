# 11 - Database Standard — MySQL 8

## Default

Branch `mysql-v8` menggunakan MySQL 8 melalui Bun.SQL.

```env
TZ=UTC
DB_DRIVER=mysql
DATABASE_URL=mysql://user:password@mysql:3306/service_db
DB_POOL_MAX=10
DB_IDLE_TIMEOUT_SECONDS=30
DB_CONNECTION_TIMEOUT_SECONDS=10
DB_MAX_LIFETIME_SECONDS=0
DB_PREPARE=true
DB_TLS_MODE=disable
# DB_TLS_CA_FILE=/run/secrets/mysql-ca.pem
DB_ALLOW_PUBLIC_KEY_RETRIEVAL=false
```

## Design Goal

Penggantian database tidak boleh memaksa rewrite handler/service.

```text
handler
  -> service
      -> repository
          -> Bun.SQL / MySQL 8
```

Yang stabil:
- service contract
- business rules
- API contract

Yang database-specific:
- repository query
- migration
- index strategy
- database-specific data type

## Data Types

Baseline:
- UUID: `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin`
- textual business data: `utf8mb4`
- timestamps: `DATETIME(3)`
- status kecil/stabil dapat memakai `ENUM` bila contract-nya memang fixed

UUID dibuat application dengan `crypto.randomUUID()`, bukan database default.

## Bun.SQL MySQL

MySQL tidak mendukung DML `RETURNING`.

Gunakan:
- INSERT lalu SELECT bila entity hasil insert dibutuhkan
- UPDATE lalu SELECT bila entity hasil update dibutuhkan
- `affectedRows` untuk write-result checks

Jangan gunakan syntax PostgreSQL:
- `::type`
- `TIMESTAMPTZ`
- `ON CONFLICT`
- `RETURNING`
- `pg_advisory_*`
- `CREATE EXTENSION`

## Migration

MySQL DDL dapat melakukan implicit commit. Jangan menganggap schema migration dapat rollback secara transaction seperti PostgreSQL.

Runner:
1. mengambil dedicated connection dengan `sql.reserve()`
2. mengambil named lock `GET_LOCK()`
3. memeriksa apakah migration sudah tercatat
4. menjalankan migration
5. mencatat `schema_migrations`
6. melepaskan lock dengan `RELEASE_LOCK()`

Migration harus retry-safe karena failure setelah partial DDL dapat meninggalkan sebagian schema sudah berubah.

Untuk syntax seperti `CREATE INDEX IF NOT EXISTS` yang tidak tersedia secara konsisten pada MySQL 8, periksa `information_schema` sebelum DDL.

## Seeder

Seed/reference data baru tidak ditempatkan di migration. Gunakan `database/seed.ts` dan file `database/seeders/*.seeder.ts`. Baseline migration lama yang sudah berisi reference category tetap dibiarkan immutable untuk kompatibilitas database yang sudah pernah menjalankannya.

Aturan:
- seeder wajib idempotent dan aman dijalankan ulang
- setiap seeder dijalankan dalam transaction
- named lock mencegah concurrent seeding
- production membutuhkan `--force`
- seeder reference data boleh melakukan upsert, tetapi conflict identitas yang mencurigakan harus fail, bukan diam-diam ditimpa
- schema tetap menjadi tanggung jawab migration

## Timezone

Baseline waktu adalah UTC:
- application runtime: `TZ=UTC`
- Docker runtime: UTC
- MySQL server: `--default-time-zone=+00:00`
- Bun.SQL: setiap MySQL connection memakai session `time_zone='+00:00'`
- timestamp schema baseline: `DATETIME(3)`

Jangan menyimpan local wall-clock timezone di database tanpa kebutuhan domain yang eksplisit. Konversi timezone untuk presentation dilakukan di boundary aplikasi/client.

## Authentication / TLS

MySQL 8 default memakai `caching_sha2_password`.

Bun menolak RSA public-key retrieval di koneksi plaintext secara default. `DB_ALLOW_PUBLIC_KEY_RETRIEVAL=true` hanya diperbolehkan pada development/test trusted network.

Staging/production wajib memakai `DB_TLS_MODE=verify-full` dan menjaga `DB_ALLOW_PUBLIC_KEY_RETRIEVAL=false`. Untuk private/custom CA, gunakan `DB_TLS_CA_FILE`; client tetap memverifikasi certificate chain dan hostname.

## Production Checklist

- least-privilege application user
- TLS untuk network non-local
- connection pool bounded
- explicit indexes
- unique/idempotency constraints
- health/readiness
- graceful close
- backup/restore teruji
- migration concurrency lock
- slow query monitoring
