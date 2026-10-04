# 20 - Service Bootstrap

## Purpose

Gunakan repository ini sebagai baseline microservice, bukan sebagai framework yang harus diwarisi seluruh sistem.

## New Service Checklist

Saat membuat service baru:

1. clone/copy starter
2. ubah `package.json.name`
3. ubah `SERVICE_NAME` di `.env.example`
4. isi `docs/00-PROJECT.md` dengan responsibility/non-responsibility service
5. hapus module example setelah module nyata tersedia
6. tentukan apakah service membutuhkan PostgreSQL
7. aktifkan Redis worker hanya bila background processing benar-benar dibutuhkan
8. aktifkan scheduler hanya bila ada time-based execution nyata; register task dan tentukan durability/catch-up policy
9. tentukan auth/tenant policy bila service menerima traffic terproteksi
10. definisikan outbound dependency name + timeout/idempotency bila ada provider/API eksternal
11. tetapkan outbound origin/SSRF policy untuk setiap provider/internal HTTP dependency
12. pastikan route contoh sudah dihapus atau tetap disabled
13. jalankan seluruh release readiness checks sebelum deployment pertama

## Required Commands

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run audit:prod
bun run release:check
```

Integration test PostgreSQL/Redis dijalankan melalui CI atau environment lokal yang menyediakan dependency terkait.

## Naming

Gunakan service name yang:
- lowercase
- stabil
- menggambarkan business capability
- bukan nama host/VM
- bukan nama environment

Contoh:

```text
payment-callback-service
notification-service
reconciliation-service
```

Hindari:

```text
backend-2
api-new
service-final
microservice-v3
```

Karena sejarah software sudah cukup dipenuhi nama yang menjadi kebohongan permanen.

## Remove What You Do Not Need

Jika service tidak menggunakan:
- worker: jangan deploy worker/Redis overlay
- scheduler: jangan deploy scheduler overlay
- metrics: biarkan disabled
- tenant context: jangan pasang middleware tenant
- auth: jangan membuat auth dummy
- external provider: jangan membuat adapter kosong

Starter adalah baseline, bukan kewajiban memakai seluruh folder.

## First Production Deployment

Pastikan:
- `APP_ENV=production`
- secret hanya berasal dari secret/env management deployment
- database user least-privilege
- Redis tidak public bila worker digunakan
- reverse proxy timeout/body limit sesuai service
- readiness/liveness terhubung ke orchestrator/load balancer
- termination grace period > drain delay + shutdown timeout
- `/metrics` memakai `METRICS_TOKEN` dan tetap internal bila diaktifkan
- `EXAMPLE_ROUTES_ENABLED=false`
- provider/internal base URL berasal dari trusted config, bukan input client
