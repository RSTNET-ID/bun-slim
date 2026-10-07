# 22 - Release Readiness

## v1 Core Gate

Sebelum menandai release/tag:

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun run audit:prod
bun run test
bun run build
bun run release:check
```

CI juga harus lulus:
- PostgreSQL migration + integration
- Redis integration
- Compose validation for base, worker, and scheduler overlays
- production Docker build
- non-root runtime verification
- container liveness smoke test

## Security Gate

Pastikan:
- tidak ada credential nyata di `.env.example`
- structured log menggunakan redaction
- dependency high/critical audit bersih atau exception terdokumentasi
- runtime container non-root
- forwarded IP tidak dipercaya tanpa proxy policy
- tenant scope tidak dipercaya tanpa authorization

## Operations Gate

Pastikan:
- liveness/readiness semantics terdokumentasi
- drain delay/shutdown deadline diketahui deployment
- DB/Redis connection lifecycle tertutup saat shutdown
- outbound request memiliki timeout
- retried write memiliki idempotency contract
- metrics tidak menggunakan high-cardinality labels
- shared image tidak memiliki role-specific image-level healthcheck
- worker/scheduler memakai loopback process readiness endpoint, bukan PID-only healthcheck
- container stop grace melebihi application shutdown/job timeout budget
- compiled production binaries tidak auto-load `.env` atau `bunfig.toml`
- migration/seeder registries sinkron dengan source files
- runtime image membawa `./migrate` dan `./seed` tanpa TypeScript `database/` source
- app/worker/scheduler gated oleh successful one-shot migration
- final image lulus Trivy HIGH/CRITICAL scan dan menghasilkan SPDX SBOM
- production image membawa standalone `./doctor`
- final deployment environment lulus `./doctor` sebelum traffic diberikan

## Data Gate

Pastikan:
- migration baru atomic sesuai database baseline
- reference/sample data baru memakai idempotent seeder
- scheduler task names/cron expressions tervalidasi
- production migration tidak diedit ulang
- pagination bounded/deterministic
- writes penting memiliki transaction/idempotency sesuai domain
- DB write + job/event yang wajib atomic memakai transactional outbox atau equivalent durable handoff

## Starter Gate

`bun run release:check` memverifikasi invariant repository:
- required files/docs tersedia
- package name/version valid
- required scripts tersedia
- env example baseline lengkap
- secret-like values tertentu tidak muncul di env example
- gitignore melindungi local env/build/dependency files
- AGENTS tetap menunjuk source-of-truth docs

## Repository Governance Gate

Sebelum repository diperlakukan sebagai protected production baseline:
- `main` dan `mysql-v8` harus memakai branch protection/ruleset yang melarang force-push dan branch deletion
- perubahan ke protected branch harus melalui pull request
- required CI status checks diaktifkan setelah runner/quota CI tersedia dan nama checks stabil
- Renovate GitHub App atau Renovate self-hosted harus benar-benar aktif; keberadaan `renovate.json` saja tidak menjalankan updater
- initial Docker digest pin PR harus direview sampai base/service images berbentuk `tag@sha256:<digest>`

Kontrol di atas berada di repository/organization settings dan tidak dapat dibuktikan oleh source tree saja.

## Public Repository Gate

Sebelum atau segera setelah visibility repository diubah menjadi public:
- pastikan `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`, dan GitHub issue/PR templates tersedia
- review metadata commit karena author/committer email pada Git history dapat terlihat publik
- verifikasi current tree hanya membawa `.env.example`, bukan `.env`, private key, credential file, atau mounted secret
- setelah repository public, review GitHub secret-scanning alerts; public repositories dipindai otomatis termasuk seluruh Git history dan semua branch
- aktifkan push protection/security settings yang tersedia untuk mencegah secret baru masuk
- aktifkan branch protection/ruleset untuk `main` dan `mysql-v8`
- aktifkan Renovate dan review initial Docker digest pin PR

Jangan rewrite Git history hanya untuk kosmetik metadata tanpa rencana khusus. History rewrite mengubah commit SHA, dapat membatalkan signature/tag/reference, dan harus diperlakukan sebagai operasi migrasi repository.

## Release Flow

1. merge final PR ke `main`
2. pastikan CI `main` hijau
3. update changelog bila ada perubahan setelah release candidate
4. buat immutable tag `vX.Y.Z`
5. gunakan tag tersebut sebagai baseline service baru

Jangan membuat tag release dari branch review yang belum menjadi `main`.
