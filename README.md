# Bun + Hono Microservice Starter

Starter microservice ringan menggunakan Bun native + Hono.

## Baseline

- **Runtime**: Bun 1.4+
- **HTTP Framework**: Hono
- **Language**: TypeScript
- **Database**: Bun.SQL, PostgreSQL default
- **Validation**: Zod
- **Testing**: `bun:test`
- **Container**: Docker multi-stage build, non-root

Branch `main` adalah baseline PostgreSQL-only. Varian MySQL 8 berada di branch `mysql-v8`; handler/service contract tetap dijaga sama, sedangkan persistence boundary tetap database-specific.

## Quick Start

```bash
bun install
cp .env.example .env
bun run dev
```

### Database

Development dapat memakai TLS disabled pada jaringan lokal/container:

```env
DB_DRIVER=postgres
DB_TLS_MODE=disable
# DB_TLS_CA_FILE=/run/secrets/postgres-ca.pem
```

Staging/production wajib memakai `DB_TLS_MODE=verify-full`. Bun.SQL mendukung mode TLS PostgreSQL dan custom CA melalui `DB_TLS_CA_FILE`.

### Migration

```bash
bun run migrate:up
bun run seed
bun run migrate:status
```

### Tests

Unit + HTTP contract:

```bash
bun run test
```

`bun test` tetap dapat dipakai untuk discovery semua test; database integration akan skip bila `DATABASE_URL` tidak tersedia.

Per layer:

```bash
bun run test:unit
bun run test:contract
bun run test:integration
```

`test:integration` membutuhkan PostgreSQL test database yang sudah dimigrasi dan reference seeder dapat dijalankan dengan `bun run seed`.

### Quality

```bash
bun run format:check
bun run lint
bun run typecheck
bun run build
```

### List Routes

```bash
bun route:list
```

### Docker

```bash
docker compose up --build
```

Compose menjalankan one-shot `./migrate up` setelah database healthy. App baru start jika migration exit 0. Migration dibundle ke binary melalui static registry, jadi runtime image tidak perlu membawa source TypeScript `database/`. Seeder tetap explicit melalui profile `seed`.

Shared image tidak memiliki image-level healthcheck karena image yang sama menjalankan server, worker, dan scheduler. Compose memasang health probe per role, graceful-stop budget, resource limit baseline, dan log rotation. Worker/scheduler memakai loopback process health pada `127.0.0.1:9465`.

`docker compose up` otomatis menjalankan one-shot `./migrate up` setelah PostgreSQL healthy dan baru menjalankan app setelah migration sukses. Seeder tetap opt-in:

```bash
docker compose --profile seed run --rm seed
```

Runtime image membawa compiled `./migrate` dan `./seed`; TypeScript source `database/` tidak ikut runtime image. Lihat `docs/08-DEPLOYMENT.md` dan `docs/19-CONTAINER-RUNTIME-HARDENING.md`.

## Structure

```text
src/
├── app.ts
├── server.ts
├── config/
├── database/
├── shared/
├── routes/
└── modules/

tests/
├── unit/
├── contract/
└── integration/

database/
├── migrate.ts
├── seed.ts
├── migrations/
└── seeders/
```

Lihat `docs/` dan `AGENTS.md` untuk standar architecture, database, security, testing, deployment, dan coding-agent.

## Optional Redis Worker

Core starter tidak membutuhkan Redis.

Bila service membutuhkan background job, tersedia optional worker pack berbasis Bun native Redis client + Redis Streams.

Build menghasilkan tujuh binary:

```text
dist/server
dist/worker
dist/scheduler
dist/job-dead
dist/doctor
dist/migrate
dist/seed
```

Jalankan worker lokal:

```bash
WORKER_ENABLED=true \
REDIS_URL=redis://127.0.0.1:6379 \
bun run worker:dev
```

Compose dengan Redis + worker:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.worker.yml \
  up --build
```

Register job handler di `src/worker/registry.ts` dan enqueue melalui `@/worker/producer`.

Lihat `docs/12-WORKER-REDIS-STANDARD.md` untuk delivery semantics, retry, dead-letter, stale reclaim, idempotency, dan graceful shutdown.

## Optional Bun.cron Scheduler

Scheduler berjalan sebagai process terpisah dari HTTP server dan worker.

Daftarkan task di `src/scheduler/registry.ts`. Untuk pekerjaan durable/retryable, scheduler sebaiknya hanya memanggil `enqueueJob()` lalu worker yang mengeksekusi business work.

```bash
SCHEDULER_ENABLED=true SCHEDULER_TIMEZONE=Asia/Jakarta bun run scheduler:dev
```

Runtime/database tetap UTC. Scheduler default memakai `SCHEDULER_TIMEZONE=UTC`, dapat diubah misalnya menjadi `Asia/Jakarta`, dan setiap task boleh memiliki `timezone` sendiri. Baseline production tetap satu scheduler replica.

Compose template setelah minimal satu task terdaftar:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.scheduler.yml \
  --profile scheduler \
  up --build scheduler redis postgres
```

Lihat `docs/25-SCHEDULER-STANDARD.md`.

## Database Seeder

Reference/sample data baru dikelola melalui seeder terpisah:

```bash
bun run seed
bun run seed:run -- example_categories
bun run seed:create roles
```

Seeder bersifat idempotent, transactional, memakai PostgreSQL advisory lock, dan membutuhkan `--force` di production. Migration historis tetap immutable.

## Runtime Doctor

Preflight runtime tersedia untuk memvalidasi environment, Bun version, worker/scheduler registry, database, dan Redis bila dikonfigurasi:

```bash
bun run doctor
bun run doctor:offline
bun run doctor -- --json
```

Production image membawa standalone binary:

```bash
./doctor
./doctor --offline
./doctor --json
```

Gunakan `./doctor` sebagai deployment/pre-start check, bukan liveness probe periodik. Lihat `docs/27-RUNTIME-DOCTOR.md`.

## Dead-Letter Operations

Worker DLQ memiliki CLI operasional bounded:

```bash
bun run job:dead:list -- --limit=20
bun run job:dead:show -- <stream-id>
bun run job:dead:replay -- <stream-id>
bun run job:dead:purge -- --older-than=30d --limit=100 --force
```

Payload disembunyikan pada `show` kecuali `--payload` diberikan. Replay production membutuhkan `--force`, mempertahankan `job_id`, mereset `attempt=1`, dan hanya boleh dilakukan bila handler job masih terdaftar.

Production image juga membawa standalone binary sehingga tidak membutuhkan Bun runtime/source tree:

```bash
./job-dead list --limit=20
./job-dead show <stream-id>
./job-dead replay <stream-id> --force
./job-dead purge --older-than=30d --limit=100 --force
```

Lihat `docs/12-WORKER-REDIS-STANDARD.md`.

## Transactional Outbox

Jika business database write **harus** menghasilkan background job/event dan kehilangan publish tidak dapat diterima, jangan mengandalkan pola `commit DB -> enqueue Redis` sebagai atomic operation.

Gunakan transactional outbox sesuai `docs/26-OUTBOX-IDEMPOTENCY-STANDARD.md`. Direct `enqueueJob()` tetap tepat untuk pekerjaan yang tidak perlu atomic dengan business DB write.

## Resilience, Metrics, and Production Hardening

Starter menyediakan baseline tambahan tanpa dependency runtime baru:

- resilient outbound HTTP melalui `fetchWithPolicy()`
- timeout + bounded retry
- mandatory Idempotency-Key untuk retried POST/PATCH
- request ID propagation
- optional Prometheus-compatible `/metrics` untuk HTTP dan listener metrics terpisah untuk worker/scheduler
- low-cardinality HTTP/outbound metrics
- API security headers
- Bun request body hard limit
- explicit server idle timeout
- bounded graceful shutdown
- production dependency audit di CI

Worker/scheduler menyajikan metrics pada listener terpisah `METRICS_HOST:METRICS_PORT` (default `0.0.0.0:9464`) dan lifecycle listener mengikuti lifecycle process. `METRICS_TOKEN` wajib saat metrics diaktifkan.

Dokumentasi:
- `docs/14-OUTBOUND-HTTP-STANDARD.md`
- `docs/15-METRICS-STANDARD.md`
- `docs/16-PRODUCTION-HARDENING.md`

## Identity, Lifecycle, and Container Safety

Baseline tambahan:
- tenant header membutuhkan authorization callback
- rate limiter tidak mempercayai forwarded IP header secara default
- readiness berubah 503 saat shutdown/drain dimulai
- configurable drain propagation delay
- production runtime image tidak lagi membawa Bun runtime
- non-root + no-new-privileges + dropped capabilities
- read-only root filesystem + bounded PID count
- Docker image build dan liveness smoke test di CI

Dokumentasi:
- `docs/17-IDENTITY-TENANT-BOUNDARY.md`
- `docs/18-DRAIN-READINESS-STANDARD.md`
- `docs/19-CONTAINER-RUNTIME-HARDENING.md`

## Core v1 Status

Phase 1–12 selesai. Core Bun Slim sekarang **feature-frozen** untuk baseline v1.

Sebelum release/tag:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run audit:prod
bun run test
bun run build
bun run release:check
```

Dokumentasi penutup:
- `docs/20-SERVICE-BOOTSTRAP.md`
- `docs/21-CORE-FREEZE.md`
- `docs/22-RELEASE-READINESS.md`
- `docs/23-SECRET-LOGGING-STANDARD.md`
- `SECURITY.md`
- `CHANGELOG.md`

Setelah v1, tambahan framework/infrastruktur baru sebaiknya masuk service-specific implementation atau optional pack, bukan core starter.
