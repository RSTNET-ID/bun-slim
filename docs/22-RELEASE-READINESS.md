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
- Compose validation
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

## Data Gate

Pastikan:
- migration baru atomic sesuai database baseline
- production migration tidak diedit ulang
- pagination bounded/deterministic
- writes penting memiliki transaction/idempotency sesuai domain

## Starter Gate

`bun run release:check` memverifikasi invariant repository:
- required files/docs tersedia
- package name/version valid
- required scripts tersedia
- env example baseline lengkap
- secret-like values tertentu tidak muncul di env example
- gitignore melindungi local env/build/dependency files
- AGENTS tetap menunjuk source-of-truth docs

## Release Flow

1. merge final PR ke `main`
2. pastikan CI `main` hijau
3. update changelog bila ada perubahan setelah release candidate
4. buat immutable tag `vX.Y.Z`
5. gunakan tag tersebut sebagai baseline service baru

Jangan membuat tag release dari branch review yang belum menjadi `main`.
