# 09 - Development Guide

## Baseline Commands

```bash
bun install
bun run dev
bun route:list
bun test
bun run build
```

## Environment

Minimal:

```env
APP_ENV=development
SERVICE_NAME=example-service
PORT=3000
LOG_LEVEL=info

DB_DRIVER=postgres
DATABASE_URL=postgres://user:password@127.0.0.1:5432/example_service
```

Jika worker digunakan:

```env
REDIS_URL=redis://127.0.0.1:6379
```

## Dependency Policy

Gunakan Bun native lebih dahulu.

Urutan keputusan:
1. Apakah Bun native cukup?
2. Apakah Hono sudah menyediakan kebutuhan HTTP tersebut?
3. Baru pertimbangkan dependency eksternal.

Jangan otomatis menambahkan ORM, Redis, queue library, OpenTelemetry, Swagger generator, DI container, atau abstraction framework tanpa kebutuhan nyata.
