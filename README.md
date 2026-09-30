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

`test:integration` membutuhkan PostgreSQL test database yang sudah dimigrasi.

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
└── migrations/
```

Lihat `docs/` dan `AGENTS.md` untuk standar architecture, database, security, testing, deployment, dan coding-agent.

## Optional Redis Worker

Core starter tidak membutuhkan Redis.

Bila service membutuhkan background job, tersedia optional worker pack berbasis Bun native Redis client + Redis Streams.

Build menghasilkan dua binary:

```text
dist/server
dist/worker
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
