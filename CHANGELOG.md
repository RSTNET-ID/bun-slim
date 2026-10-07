# Changelog

Semua perubahan penting pada Bun Slim dicatat di file ini.

Format mengikuti semantic versioning.

## Unreleased - mysql-v8

### Added
- public open-source project files added: MIT license, contributing guide, code of conduct, support policy, and GitHub issue/PR templates
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
- dedicated `mysql-v8` branch based on `main`
- MySQL 8 Bun.SQL baseline and development Compose service
- MySQL 8 migration runner with named connection lock
- MySQL 8 integration CI and configuration security tests
- dedicated Bun.cron scheduler process, registry, runner, tests, and Compose overlay

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
- PostgreSQL-specific schema/query syntax replaced with MySQL 8 equivalents
- UUID baseline uses application-generated `CHAR(36)` values
- DML `RETURNING` paths replaced with MySQL-compatible write/read handling
- database documentation and agent rules aligned to MySQL 8
- production database TLS is enforced with `DB_TLS_MODE=verify-full`
- example seed UUIDs are shared between in-memory tests and MySQL fixtures
- repository create/update readback is transactionally consistent
- cursor queries use index-friendly MySQL query shapes
- migration runner rejects MariaDB/MySQL < 8 and release checks guard against PostgreSQL syntax regressions
- UTC is enforced across application, worker, container, and MySQL server runtime
- transactional, idempotent database seeder runner with production `--force` guard
- dedicated reference category seeder added; historical baseline migration remains immutable for compatibility
- worker/scheduler responsibility rules aligned with PostgreSQL main

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
- metrics authorization now fails closed when the configured token is unavailable
- runtime doctor now accepts only the reviewed Bun 1.4.x production line starting at 1.4.2
- production policy now requires `/metrics` and `/health/ready` to remain on trusted/internal exposure paths
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
