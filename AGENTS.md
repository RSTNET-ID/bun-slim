# AGENTS.md

Repository branch `mysql-v8` mengikuti Bun + Hono Microservice Standard dengan MySQL 8 sebagai database baseline.

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
11. MySQL 8 adalah database baseline pada branch ini; domain/service tidak boleh bergantung pada detail dialect bila dapat dihindari.
12. Jangan memasukkan kembali syntax PostgreSQL seperti `RETURNING`, `::type`, `TIMESTAMPTZ`, `ON CONFLICT`, `pg_*`, atau PostgreSQL advisory lock.
13. Migration MySQL harus mempertimbangkan implicit DDL commit dan dibuat retry-safe.
14. Migration baru hanya mengelola schema; reference/sample data baru masuk ke idempotent `database/seeders/*.seeder.ts`. Jangan edit migration historis untuk memindahkan seed.
15. Runtime timezone wajib UTC di application dan database. Staging/production MySQL wajib menggunakan `DB_TLS_MODE=verify-full`; `DB_ALLOW_PUBLIC_KEY_RETRIEVAL=true` hanya untuk development/test pada jaringan tepercaya.
16. Worker, bila diperlukan, menggunakan Bun native RedisClient + Redis Streams consumer group.
17. Scheduler, bila diperlukan, menggunakan dedicated `Bun.cron()` process; runtime/database tetap UTC, sedangkan jadwal memakai IANA timezone eksplisit dari `SCHEDULER_TIMEZONE` atau override per task. Jangan register cron di HTTP server.
18. Worker handler wajib memperlakukan delivery sebagai at-least-once dan menjaga operasi write tetap idempotent.
19. Gunakan `bun run migrate create <name>` dan `bun run seed:create <name>` agar static runtime registry ikut diperbarui; jangan menambah file migration/seeder tanpa registry sync.
20. Tambah atau update test untuk perubahan behavior.
21. Update dokumentasi terkait architecture, API, data, security, observability, atau deployment.
22. Perubahan architecture penting harus memiliki ADR.

Dependency direction default:

`route -> handler -> service -> repository/adapter`

Dilarang membuat dependency balik dari repository/domain ke Hono/HTTP.

## Database

- Gunakan Bun.SQL dengan `DB_DRIVER=mysql`.
- Gunakan parameterized tagged templates.
- UUID baseline: `CHAR(36)` ASCII binary collation, dibuat application.
- Timestamp baseline: `DATETIME(3)`, UTC.
- Untuk hasil DELETE/UPDATE gunakan metadata seperti `affectedRows`; jangan meniru `RETURNING`.
- Migration concurrency memakai MySQL named lock pada dedicated reserved connection.
- Jangan mengasumsikan DDL rollback transactional.

## Outbound HTTP

- Gunakan `fetchWithPolicy()` sebagai baseline outbound HTTP.
- Retry write tidak boleh diaktifkan tanpa idempotency strategy.
- Jangan log full URL/query, Authorization, API key, token, atau payload sensitif.

## Observability

- Metrics label harus low-cardinality.
- Jangan gunakan raw path, request ID, tenant ID, transaction ID, atau user input sebagai metric label.
- `/metrics` disabled by default dan production exposure harus dibatasi oleh network/proxy policy.

## Worker Operations

- Pertahankan DLQ tooling di `scripts/job-dead.ts`.
- List/show harus read-only dan bounded.
- Replay production membutuhkan explicit force guard serta handler yang masih terdaftar.
- Purge selalu membutuhkan `--force`, cutoff umur, dan batch limit.
- Jangan expose payload DLQ secara default.

## Outbox Reliability

- Gunakan transactional outbox bila DB write wajib menghasilkan job/event dan kehilangan publish tidak dapat diterima.
- Dispatcher dan worker tetap at-least-once; consumer harus idempotent.
- Lihat `docs/26-OUTBOX-IDEMPOTENCY-STANDARD.md`.
- Gunakan `docs/27-RUNTIME-DOCTOR.md` untuk deployment/pre-start validation.
- Gunakan `docs/28-FILE-BACKED-SECRETS.md` untuk mounted secret dan `*_FILE` runtime configuration.

## Scheduler

- Scheduler menentukan waktu; worker menangani durable/retryable execution.
- Default production scheduler adalah satu replica.
- Multi-replica scheduler memerlukan distributed lease/leader election.
- Default jadwal memakai `SCHEDULER_TIMEZONE` (UTC bila tidak diubah); task boleh override dengan IANA timezone eksplisit.
- Task scheduler tidak boleh menyalin business logic dari service.

## Production Runtime

- Pertahankan request body limit dan graceful shutdown deadline.
- Jangan mengaktifkan Bun development error page di staging/production.
- High/critical production dependency advisory dianggap CI blocker kecuali ada documented security exception.

## Secret and Logging

- Jangan log seluruh `process.env`, credential object, Authorization, cookie, token, password, DB/Redis URL credential, atau private key.
- Pertahankan recursive logger redaction dan test coverage-nya.

## Container Runtime

- Production container harus non-root.
- Pertahankan no-new-privileges, dropped capabilities, read-only root filesystem, bounded PID count, dan tmpfs kecil.

## Core Freeze

Core tetap feature-complete. Perubahan harus berupa correctness/security/reliability fix, compatibility update, complexity reduction, atau proven production failure mode.

Sebelum release/tag jalankan `bun run release:check`.
