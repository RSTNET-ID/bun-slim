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

PostgreSQL adalah implementasi default. MySQL dapat digunakan kemudian dengan mengganti database boundary yang memang dialect-specific tanpa mengubah handler/service.

## Quick Start

```bash
bun install
cp .env.example .env
bun run dev
```

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

Build menghasilkan tiga binary:

```text
dist/server
dist/worker
dist/scheduler
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
SCHEDULER_ENABLED=true bun run scheduler:dev
```

Baseline scheduler memakai UTC dan satu scheduler replica. Bun mencegah overlap task yang sama dalam satu process, tetapi tidak melakukan deduplication antar replica.

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

## Resilience, Metrics, and Production Hardening

Starter menyediakan baseline tambahan tanpa dependency runtime baru:

- resilient outbound HTTP melalui `fetchWithPolicy()`
- timeout + bounded retry
- mandatory Idempotency-Key untuk retried POST/PATCH
- request ID propagation
- optional Prometheus-compatible `/metrics`
- low-cardinality HTTP/outbound metrics
- API security headers
- Bun request body hard limit
- explicit server idle timeout
- bounded graceful shutdown
- production dependency audit di CI

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
