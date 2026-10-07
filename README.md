# Bun + Hono Microservice Starter — MySQL 8

Branch `mysql-v8` adalah varian Bun Slim yang menggunakan **MySQL 8** sebagai database baseline.

## Why Bun Slim

Bun Slim adalah starter backend kecil yang sudah membawa baseline lifecycle dan production hardening tanpa menjadikan core sebagai koleksi framework. Branch ini mempertahankan filosofi yang sama dengan `main`, tetapi persistence mengikuti MySQL 8 secara eksplisit.

Prinsip utamanya:

- gunakan kemampuan native Bun lebih dulu bila sudah cukup;
- pertahankan dependency runtime sesedikit mungkin;
- business logic tidak bergantung pada Hono context;
- hindari ORM/query-builder internal tanpa kebutuhan konkret;
- production safety lebih penting daripada abstraction kosmetik;
- fitur domain tetap berada di service turunan.

## Intended Scope

Cocok untuk REST/API service, internal service, mobile backend, provider integration, worker, scheduler, dan service MySQL 8 yang membutuhkan baseline production.

Bun Slim sengaja tidak memasukkan JWT provider tertentu, RBAC framework, Kafka, object-storage SDK, tracing stack besar, atau orchestration framework ke core.

## Database Variants

- `main`: PostgreSQL baseline.
- `mysql-v8`: MySQL 8 baseline ini.

Application contract dijaga serupa, tetapi detail schema, locking, DDL, cursor query, dan transaction behavior tetap database-specific.


## Baseline

- **Runtime**: Bun 1.4.2+ (1.4.x production baseline)
- **HTTP Framework**: Hono
- **Language**: TypeScript
- **Database**: Bun.SQL + MySQL 8
- **Validation**: Zod
- **Testing**: `bun:test`
- **Container**: Docker multi-stage build, non-root

Branch ini sengaja **MySQL-only**. Branch `main` tetap menjadi baseline PostgreSQL.

## Quick Start

```bash
bun install
cp .env.example .env
docker compose up -d mysql
bun run migrate:up
bun run seed
bun run dev
```

Untuk Docker penuh:

```bash
docker compose up --build
```

Compose menjalankan one-shot `./migrate up` setelah MySQL healthy. App baru start jika migration exit 0. Migration dibundle ke binary melalui static registry, jadi runtime image tidak perlu membawa source TypeScript `database/`. Seeder tetap explicit melalui profile `seed`.

Shared image tidak memiliki image-level healthcheck karena image yang sama menjalankan server, worker, dan scheduler. Compose memasang health probe per role, graceful-stop budget, resource limit baseline, dan log rotation. Worker/scheduler memakai loopback process health pada `127.0.0.1:9465`.

`docker compose up` otomatis menjalankan one-shot `./migrate up` setelah MySQL healthy dan baru menjalankan app setelah migration sukses. Seeder tetap opt-in:

```bash
docker compose --profile seed run --rm seed
```

Runtime image membawa compiled `./migrate` dan `./seed`; TypeScript source `database/` tidak ikut runtime image. Lihat `docs/08-DEPLOYMENT.md` dan `docs/19-CONTAINER-RUNTIME-HARDENING.md`.

## Database

Default development config:

```env
TZ=UTC
DB_DRIVER=mysql
DATABASE_URL=mysql://user:password@127.0.0.1:3306/example_service
DB_TLS_MODE=disable
# DB_TLS_CA_FILE=/run/secrets/mysql-ca.pem
DB_ALLOW_PUBLIC_KEY_RETRIEVAL=false
```

MySQL 8 memakai `caching_sha2_password` secara default. Bun menolak public-key retrieval pada koneksi non-TLS kecuali diaktifkan secara eksplisit. Compose development mengaktifkannya karena traffic hanya berada pada jaringan lokal/container. Staging dan production mewajibkan `DB_TLS_MODE=verify-full` dan menolak `DB_ALLOW_PUBLIC_KEY_RETRIEVAL=true`. Untuk private/custom CA, set `DB_TLS_CA_FILE`.

### Migration

```bash
bun run migrate:up
bun run migrate:status
bun run migrate:down
```

Migration runner memakai MySQL named lock `GET_LOCK()` pada dedicated reserved connection agar dua deployment tidak mengeksekusi migration bersamaan.

Perlu diingat bahwa MySQL dapat melakukan implicit commit pada DDL. Karena itu migration harus dibuat retry-safe dan tidak boleh mengandalkan rollback transaksi DDL seperti pada PostgreSQL.

### Seeder

Seeder terpisah dari migration dan harus idempotent:

```bash
bun run seed
bun run seed:run
bun run seed:run -- example_categories
bun run seed:create feature_flags
```

Production membutuhkan konfirmasi eksplisit:

```bash
bun run seed:run -- --force
```

Setiap file `.seeder.ts` dijalankan dalam transaction. Runner juga memakai MySQL named lock agar dua proses seed tidak berjalan bersamaan.

## MySQL-specific decisions

- UUID disimpan sebagai `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin`
- UUID dibuat oleh application dengan `crypto.randomUUID()`
- waktu disimpan sebagai `DATETIME(3)`
- `updated_at` menggunakan `ON UPDATE CURRENT_TIMESTAMP(3)`
- `RETURNING` tidak digunakan karena MySQL 8 tidak mendukung DML `RETURNING`
- create/update melakukan `SELECT` setelah write bila entity hasil write dibutuhkan
- delete menggunakan `affectedRows`
- index migration memeriksa `information_schema.statistics` sebelum create/drop

## Tests

Unit + HTTP contract:

```bash
bun run test
```

Integration membutuhkan MySQL 8 yang sudah dimigrasi dan di-seed:

```bash
export TZ=UTC
export RUN_MYSQL_INTEGRATION=true
export DB_DRIVER=mysql
export DATABASE_URL=mysql://user:password@127.0.0.1:3306/example_service
export DB_TLS_MODE=disable
export DB_ALLOW_PUBLIC_KEY_RETRIEVAL=true

bun run seed
bun run test:integration
```

## Quality

```bash
bun run format:check
bun run lint
bun run typecheck
bun run build
bun run release:check
```

## Runtime Doctor

Preflight runtime tersedia untuk memvalidasi environment MySQL, Bun version, worker/scheduler registry, database, dan Redis bila dikonfigurasi:

```bash
bun run doctor
bun run doctor:offline
bun run doctor -- --json
```

Production image membawa standalone `./doctor`. Gunakan sebagai deployment/pre-start check, bukan liveness probe periodik. Lihat `docs/27-RUNTIME-DOCTOR.md`.

## Optional Redis Worker

Worker tetap optional dan menggunakan Bun native Redis client + Redis Streams.

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.worker.yml \
  up --build
```

Redis key otomatis memakai namespace `<SERVICE_NAME>:<APP_ENV>`, misalnya `artavax:production:queue:default:stream`. `REDIS_NAMESPACE` dapat dioverride untuk site/cluster tambahan. Namespace mencegah key collision; Redis ACL/credential tetap diperlukan sebagai access-control boundary pada shared Redis.

## Optional Metrics

HTTP server menyajikan `/metrics` pada `PORT`. Worker dan scheduler memakai listener terpisah pada `METRICS_HOST:METRICS_PORT` (default `0.0.0.0:9464`). Saat `METRICS_ENABLED=true`, set `METRICS_TOKEN` minimal 24 karakter. Lihat `docs/15-METRICS-STANDARD.md`.

## Optional Bun.cron Scheduler

Scheduler menggunakan dedicated process `src/scheduler.ts`, bukan HTTP server.

Register task di `src/scheduler/registry.ts`. Untuk pekerjaan durable/retryable, scheduler sebaiknya enqueue ke worker.

```bash
SCHEDULER_ENABLED=true SCHEDULER_TIMEZONE=Asia/Jakarta bun run scheduler:dev
```

Compose template:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.scheduler.yml \
  --profile scheduler \
  up --build scheduler redis mysql
```

Runtime/database tetap UTC. Scheduler default memakai `SCHEDULER_TIMEZONE=UTC`, dapat diubah menjadi IANA timezone seperti `Asia/Jakarta`, dan setiap task boleh override `timezone`. Default production replica count adalah 1. Lihat `docs/25-SCHEDULER-STANDARD.md`.

Lihat `docs/` dan `AGENTS.md` untuk architecture, database, security, testing, deployment, dan coding rules.
