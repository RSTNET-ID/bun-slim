# 21 - Core Freeze Policy

## Status

Bun Slim core dinyatakan feature-complete setelah Phase 12.

Tujuan freeze adalah menjaga starter kecil, predictable, dan mudah diaudit.

## Core Components

Core yang dipertahankan:
- Bun runtime/build
- TypeScript
- Hono HTTP boundary
- Zod boundary/config validation
- structured logging + secret redaction
- request ID
- global error mapping
- health/live/ready
- MySQL 8 baseline via Bun.SQL
- migration runner
- testing baseline
- outbound HTTP resilience
- optional lightweight metrics
- graceful shutdown/drain
- Docker production baseline
- CI quality/security/integration checks
- optional Bun.cron scheduler baseline
- optional database seeder runner

## Optional Components

Redis worker dan Bun.cron scheduler tetap optional.

Komponen berikut **tidak masuk core secara default**:
- ORM
- OpenTelemetry
- Swagger/OpenAPI generator
- Kafka/RabbitMQ/NATS
- Redis cache abstraction
- circuit breaker framework
- advanced scheduler/orchestration framework
- S3/object-storage SDK
- email provider
- websocket framework
- service container/DI framework

Mereka hanya masuk service tertentu bila requirement nyata membutuhkannya.

## Change Rule

Perubahan core baru harus memenuhi minimal satu:
1. memperbaiki correctness/security/reliability bug
2. mengikuti perubahan Bun/Hono/API yang membuat baseline lama tidak valid
3. mengurangi complexity/dependency tanpa kehilangan capability penting
4. menutup production failure mode yang sudah terbukti

"Umumnya microservice punya ini" bukan alasan yang cukup.

## Breaking Changes

Breaking change pada:
- response contract
- env semantics
- database migration behavior
- worker job contract
- scheduler task contract
- public helper contract

harus:
- didokumentasikan
- diberi migration path
- menaikkan major version bila starter sudah dirilis

## Versioning

Starter mengikuti semantic versioning:

```text
MAJOR.MINOR.PATCH
```

- PATCH: bug/security fix tanpa contract break
- MINOR: capability backward-compatible
- MAJOR: contract/baseline breaking change
