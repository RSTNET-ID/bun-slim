# 11 - Database Standard

## Default

PostgreSQL adalah database standar starter.

## Design Goal

Penggantian database tidak boleh memaksa rewrite handler/service.

```text
handler
  -> service
      -> repository
          -> database client
```

SQL dialect-specific tetap boleh berada di repository/database layer. Jangan membuat abstraction generik berlebihan hanya untuk mengejar portability teoritis.

## Config

Default:

```env
DB_DRIVER=postgres
DATABASE_URL=postgres://user:password@postgres:5432/service_db
```

Future example:

```env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:password@mysql:3306/service_db
```

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

## PgBouncer

Bila produksi menggunakan PgBouncer, repository/database layer harus menghindari asumsi session state yang tidak kompatibel dengan mode pooling yang digunakan.

Gunakan prepared statement/config hanya setelah disesuaikan dengan versi PgBouncer dan driver aktual.
