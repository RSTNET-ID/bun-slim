# Bun + Hono Microservice Starter

Standar starter microservice menggunakan Bun native + Hono.

## Baseline
- **Runtime**: Bun 1.4+
- **HTTP Framework**: Hono
- **Language**: TypeScript
- **Database Driver**: Bun Native SQL (`import { SQL } from "bun"`) - PostgreSQL default
- **Validation**: Zod
- **Testing**: `bun:test`
- **Container**: Docker multi-stage build (non-root)

## Quick Start

### Installation
```bash
bun install
```

### Environment Setup
```bash
cp .env.example .env
```

### Development
```bash
bun run dev
```

### Run Tests
```bash
bun test
```

### Type Check
```bash
bun run typecheck
```

### Docker
```bash
docker compose up --build
```

## Structure
```text
src/
├── app.ts                 # Hono app instance & global middlewares
├── server.ts              # Bun server entrypoint & graceful shutdown
├── config/                # Environment configuration validation
├── database/              # Bun native SQL client, health & transactions
├── shared/                # Logging, request ID, error handling, HTTP responses
├── routes/                # Health checks (/health) & API routes (/api/v1)
└── modules/
    └── example/           # Example module (route -> handler -> service -> repository)
```

Lihat `docs/00-PROJECT.md` sampai `docs/10-AGENT-STANDARD.md` untuk standar lengkap.
