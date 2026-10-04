# AGENTS.md

Repository ini mengikuti Bun + Hono Microservice Standard.

Sebelum mengubah kode:
1. Baca `docs/00-PROJECT.md`.
2. Baca `docs/01-ARCHITECTURE.md`.
3. Baca `docs/02-DESIGN.md`.
4. Baca `docs/13-CODING-RULES.md`.
5. Baca dokumen yang berkaitan dengan task.
6. Inspeksi implementasi existing sebelum mengubah struktur.
7. Pertahankan API/data contract kecuali perubahan breaking memang diminta.
8. Jangan menambahkan dependency/infrastruktur tanpa kebutuhan konkret.
9. Hono hanya boleh berada di HTTP boundary.
10. Business logic tidak boleh menerima `Hono Context`.
11. PostgreSQL adalah database default, tetapi persistence layer tidak boleh mengunci domain/service ke PostgreSQL.
12. Worker, bila diperlukan, menggunakan Bun native RedisClient + Redis Streams consumer group sebagai baseline.
13. Scheduler, bila diperlukan, menggunakan dedicated `Bun.cron()` process; runtime/database tetap UTC, sedangkan jadwal memakai IANA timezone eksplisit dari `SCHEDULER_TIMEZONE` atau override per task. Jangan register cron di HTTP server.
14. Service tanpa worker tidak wajib memakai Redis; jangan memasang worker/Redis hanya demi keseragaman.
15. Worker handler wajib memperlakukan delivery sebagai at-least-once dan menjaga operasi write tetap idempotent.
16. Tambah atau update test untuk perubahan behavior.
17. Update dokumentasi terkait architecture, API, data, security, observability, atau deployment.
18. Perubahan architecture penting harus memiliki ADR.

Dependency direction default:

`route -> handler -> service -> repository/adapter`

Dilarang membuat dependency balik dari repository/domain ke Hono/HTTP.

## Outbound HTTP

- Gunakan `fetchWithPolicy()` sebagai baseline outbound HTTP.
- Retry write tidak boleh diaktifkan tanpa idempotency strategy.
- Jangan log full URL/query, Authorization, API key, token, atau payload sensitif.
- Nama dependency untuk log/metrics harus bounded dan logical.

## Observability

- Metrics label harus low-cardinality.
- Jangan gunakan raw path, request ID, tenant ID, transaction ID, atau user input sebagai metric label.
- `/metrics` disabled by default dan production exposure harus dibatasi oleh network/proxy policy.

## Production Runtime

- Pertahankan request body limit dan graceful shutdown deadline kecuali business requirement mengharuskan perubahan.
- Jangan mengaktifkan Bun development error page di staging/production.
- High/critical production dependency advisory harus dianggap CI blocker kecuali ada documented security exception.

## Identity and Tenant Trust

- Jangan mempercayai tenant/company/account identifier dari header sebagai authorization.
- `tenantContext()` harus memiliki authorization callback.
- Jangan menggunakan X-Forwarded-For/X-Real-IP sebagai security/rate-limit key tanpa trusted proxy boundary yang eksplisit.

## Lifecycle

- Readiness harus gagal saat instance mulai draining.
- Jangan mengubah liveness menjadi dependency health check.
- Orchestrator grace period harus lebih panjang daripada drain delay + shutdown timeout.

## Container Runtime

- Production container harus non-root.
- Pertahankan no-new-privileges, dropped capabilities, read-only root filesystem, bounded PID count, dan tmpfs kecil kecuali ada kebutuhan terukur.


## Secret and Logging

- Jangan pernah sengaja mengirim secret ke logger; redaction adalah safety net, bukan pola penggunaan.
- Jangan log seluruh `process.env`, provider config, credential object, Authorization, cookie, token, password, DB/Redis URL credential, atau private key.
- Pertahankan recursive logger redaction dan test coverage-nya.

## Scheduler

- Scheduler menentukan waktu; worker menangani durable/retryable execution.
- Default scheduler replica count adalah 1.
- Multi-replica scheduler wajib memiliki distributed lease/leader election.
- Cron task tidak boleh menyalin business logic dari service.
- Jadwal wajib UTC pada baseline starter.
- Reference/sample data baru menggunakan `database/seeders/*.seeder.ts`, bukan migration baru.

## Core Freeze

- Setelah Phase 12, core dianggap feature-complete.
- Perubahan core baru harus berupa correctness/security/reliability fix, compatibility update, complexity reduction, atau proven production failure mode.
- ORM, OpenTelemetry, Swagger generator, broker, cache abstraction, circuit breaker framework, object-storage SDK, email, dan websocket tetap service-specific/optional kecuali ada bukti kuat untuk core.
- Sebelum release/tag jalankan `bun run release:check` dan ikuti `docs/22-RELEASE-READINESS.md`.


## Final Production Security

- Reference/example routes must remain disabled outside development/test.
- Enabled metrics require a secret bearer token and should remain network-restricted.
- Authentication verifier errors must fail closed; do not expose verifier/provider detail.
- AppError details are internal by default; expose only caller-safe validation details explicitly.
- Outbound provider URLs must come from trusted configuration unless an explicit SSRF/origin policy exists.
- Do not weaken staging/production placeholder-credential guards for convenience.
- CI third-party actions should remain pinned to immutable commits.
- Review `docs/24-PRODUCTION-SECURITY-REVIEW.md` before production release.
