# Changelog

Semua perubahan penting pada Bun Slim dicatat di file ini.

Format mengikuti semantic versioning.

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
