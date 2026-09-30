# 00 - Project Definition

## Tujuan

Dokumen pertama yang wajib dibaca manusia maupun coding agent.

Isi per service:
- Service name
- Business purpose
- Responsibility
- Non-responsibility
- Owner/team
- Upstream systems
- Downstream systems
- Database
- Queue/worker
- Cache
- External providers

## Baseline Teknologi

- Runtime: Bun
- Language: TypeScript
- HTTP: Hono
- Test: `bun:test`
- HTTP client: native `fetch`
- Default database: PostgreSQL
- Optional database replacement: MySQL/MariaDB atau database lain melalui persistence adapter
- Worker/job backend: Redis, hanya bila worker dibutuhkan
- Deployment: Docker/container, stateless application

## Service Boundary

Satu microservice harus memiliki satu tanggung jawab bisnis yang jelas.

Contoh cocok:
- webhook receiver
- notification service
- provider adapter
- reconciliation worker
- callback processor
- internal integration service

Jangan memecah service hanya demi label "microservice" bila ownership, scaling, deployment, atau failure boundary belum membutuhkannya.
