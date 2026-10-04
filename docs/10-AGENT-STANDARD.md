# 10 - Agent Standard

## Tujuan

Semua coding agent harus menghasilkan struktur, istilah, dan keputusan yang konsisten.

## Reading Order

Sebelum coding:
1. `AGENTS.md`
2. `docs/00-PROJECT.md`
3. `docs/01-ARCHITECTURE.md`
4. `docs/02-DESIGN.md`
5. dokumen terkait task
6. source code existing

## Vocabulary

Gunakan istilah baku:
- route
- handler
- service
- repository
- adapter
- provider
- middleware
- schema
- config
- worker
- job
- scheduler
- scheduled task

Gunakan `handler`, bukan membuat istilah `controller` baru untuk konsep yang sama.

## Agent Starter

Boleh membuat:
- Bun/TypeScript setup
- Hono app/server
- health endpoints
- config/env validation
- error handling
- request ID
- structured logging
- PostgreSQL baseline client
- testing baseline
- Docker
- docs templates

Jangan otomatis membuat:
- Redis
- worker
- scheduler
- ORM
- cache
- message broker
- auth
- OpenTelemetry

kecuali requirement service membutuhkannya.

## Database Agent

Default: PostgreSQL.

Tanggung jawab:
- schema
- migration
- indexes
- query
- transactions
- connection pool
- constraints

Desain harus menjaga business/service layer agar tidak terkunci pada PostgreSQL.

Jika project berpindah ke MySQL/MariaDB, perubahan harus dilokalisasi sebanyak mungkin di persistence/config layer.

## Worker Agent

Jika background processing diperlukan:
- gunakan Redis sebagai default backend worker/job
- definisikan producer dan consumer
- definisikan retry/backoff
- definisikan idempotency/deduplication
- definisikan max attempts
- definisikan failed/dead job handling
- definisikan concurrency
- definisikan graceful shutdown

Jangan memakai worker untuk request yang seharusnya synchronous sederhana.

## Scheduler Agent

Jika calendar/time-based execution diperlukan:
- gunakan dedicated `Bun.cron()` scheduler process
- gunakan timezone UTC eksplisit
- jangan register cron di HTTP server
- scheduler menentukan waktu, worker menangani durable/retryable execution
- default production scheduler = 1 replica
- multi-replica membutuhkan distributed lease/leader election
- definisikan catch-up/reconciliation bila run tidak boleh terlewat

Jangan memindahkan business logic ke scheduler callback.

## Architecture Agent

Bertanggung jawab pada:
- service boundary
- ownership
- sync/async communication
- consistency
- failure isolation
- DB/Redis requirement

Perubahan fundamental harus dicatat dengan ADR.

## Security Agent

Review:
- auth/authz
- validation
- secrets
- SQL injection
- SSRF
- logging
- network exposure
- DB privilege
- Redis privilege
- container security

## Testing Agent

Pastikan behavior changes memiliki test.

Worker membutuhkan test untuk duplicate, retry, timeout, dan failure path.

## DevOps Agent

Pastikan deployment mengikuti `08-DEPLOYMENT.md` dan tidak mengubah architecture hanya demi kemudahan compose/container.

## Definition of Done

Task selesai jika:
- implementation selesai
- relevant tests lulus
- error path ditangani
- logging cukup
- security impact diperiksa
- docs terkait diperbarui

## Outbound Integration Agent

Jika task menambahkan HTTP dependency:
- gunakan shared outbound HTTP policy
- tentukan logical dependency name
- tentukan timeout
- tentukan apakah retry aman
- untuk POST/PATCH retry, wajib definisikan idempotency contract
- test transient failure, timeout, dan cancellation bila relevan

## Observability Agent

Default:
- structured logs
- request ID
- low-cardinality metrics bila metrics diaktifkan

Jangan menambahkan OpenTelemetry stack hanya demi template. Tambahkan bila deployment memiliki collector/backend dan ownership yang jelas.

## Production Hardening Agent

Review:
- Bun development mode
- body size limit
- idle timeout
- shutdown deadline
- security headers
- reverse proxy trust assumptions
- dependency vulnerability audit

## Identity / Tenant Agent

Jika service multi-tenant:
- tenant identifier dari request tidak boleh langsung dipercaya
- tentukan authenticated principal
- implement explicit tenant authorization
- uji cross-tenant denial
- jangan gunakan forwarded IP header tanpa trusted proxy policy

## Lifecycle Agent

Review:
- readiness saat normal
- readiness saat draining
- drain propagation delay
- shutdown timeout
- orchestrator termination grace period
- long-running request yang seharusnya dipindah ke worker

## Container Hardening Agent

Pertahankan baseline:
- compiled binary runtime image
- non-root
- no-new-privileges
- capability drop
- read-only filesystem
- tmpfs untuk temporary files
- PID limit
- Docker build/smoke validation di CI
