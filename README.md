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
