# Changelog

Semua perubahan penting pada Bun Slim dicatat di file ini.

Format mengikuti semantic versioning.

## Unreleased

### Added
- shared Redis root namespace derived from `SERVICE_NAME:APP_ENV`, with explicit `REDIS_NAMESPACE` override support
- compiled migrate/seed binaries with one-shot Compose auto-migration gate
- Trivy image scanning, SPDX SBOM generation, and Renovate multi-branch digest pinning policy
- compiled `migrate` and `seed` runtime binaries with static migration/seeder registries
- one-shot Compose migration gate before app/worker/scheduler startup and opt-in seed profile
- Trivy final-image vulnerability scan, SPDX SBOM generation, and Renovate Docker digest-pin policy
- loopback worker/scheduler liveness and readiness endpoints for container health probes
- deployment runtime doctor with offline/JSON modes, DB/Redis preflight, and registry validation
- wire standalone worker/scheduler metrics listeners and scheduler execution metrics
- DLQ operational CLI for bounded list/show, atomic replay, and retention purge
- transactional outbox reliability standard for DB-write + Redis job atomicity
- transactional, idempotent PostgreSQL database seeder with advisory locking and production `--force` guard
- dedicated Bun.cron scheduler process, registry, validation tests, standalone binary, and Compose overlay
- UTC runtime baseline for application, worker, PostgreSQL development service, and scheduler

### Changed
- Bun runtime, Docker build image, CI toolchain, and runtime doctor baseline upgraded from 1.4.0 to 1.4.2
- example module repository is now Bun.SQL-first with typed results, native SQL fragments/object helpers, transaction executor injection, and test-only persistence fakes
- coding agent/rules now forbid internal query builders, ORM wrappers, and generic base repositories unless a concrete production need justifies them
- worker stream, DLQ, and consumer group names now use `<REDIS_NAMESPACE>:queue:<WORKER_QUEUE_NAME>:...`; legacy `WORKER_QUEUE_PREFIX` was removed
- staging/production now require an explicit non-placeholder `SERVICE_NAME` so default Redis namespaces cannot collide across starter deployments
- Compose now separates runtime, database, and queue networks; HTTP container health uses database-aware readiness
- migration runner supports dedicated `MIGRATION_DATABASE_URL` credentials so application runtime need not hold DDL privileges
- production image no longer copies TypeScript `database/` source; database operations are bundled into standalone binaries
- shared Docker image no longer owns an HTTP-only healthcheck; Compose now defines health per process role
- Compose stop grace, runtime resource bounds, and json-file log rotation aligned with application lifecycle
- standalone production binaries disable automatic `.env` and `bunfig.toml` loading
- Docker build runtime is forced to UTC and CI refreshes mutable base tags with `--pull`
- worker job envelope validation is shared by runtime and DLQ replay tooling
- main database config is PostgreSQL-only and staging/production require verified TLS
- scheduler responsibilities are explicitly separated from worker durable execution
- coding rules now require new reference/sample data to use seeders rather than new migrations
- release readiness checks guard scheduler, seeder, and UTC baseline

## 1.0.0 - 2026-10-01

### Added
- Bun + Hono TypeScript microservice baseline
- PostgreSQL Bun.SQL persistence and atomic migration runner
- deterministic cursor pagination baseline
- unit, contract, PostgreSQL, and Redis integration testing
- optional Redis Streams worker with retry, dead letter, stale reclaim, and graceful shutdown
- resilient outbound HTTP policy with timeout, bounded retries, cancellation, request ID propagation, and write idempotency guard
- structured logs, low-cardinality metrics, health/live/ready endpoints
- API security headers, body limits, graceful drain/readiness lifecycle
- tenant authorization boundary and safe rate-limit identity defaults
- hardened non-root read-only production container and Docker smoke tests
- dependency audit and release-readiness checks
- recursive structured-log secret redaction

### Security hardening
- reference CRUD routes are disabled outside development/test
- enabled metrics require bearer authentication
- auth verifier failures fail closed to generic 401 responses
- internal AppError details are hidden by default
- staging/production reject known placeholder database credentials
- GitHub Actions are pinned to immutable commits
- final production security review added

### Policy
- core is feature-frozen after Phase 12
- additional infrastructure/framework capabilities should be service-specific or optional packs unless a proven core requirement exists
