# 19 - Container Runtime Hardening

## Production Image

Build stage menggunakan Bun, sedangkan runtime image tidak menginstal package/runtime Bun secara terpisah.

Compiled executable Bun tetap membawa runtime yang dibutuhkan di dalam standalone binary. Jadi boundary yang benar adalah:

```text
oven/bun:1.4.x-alpine
  -> install dependencies
  -> typecheck
  -> compile standalone binaries

alpine:3.22
  -> ca-certificates
  -> tzdata
  -> curl
  -> dumb-init
  -> libstdc++
  -> server / worker / scheduler / job-dead / doctor / migrate / seed
```

Runtime image tidak membawa `node_modules`, package manager, source application lengkap, atau development toolchain.

## Deterministic Standalone Configuration

Semua production binary dikompilasi dengan:

```text
--no-compile-autoload-dotenv
--no-compile-autoload-bunfig
```

Production configuration harus berasal dari environment/secrets deployment, bukan file `.env` atau `bunfig.toml` yang ditemukan secara kebetulan pada working directory.

## UTC Runtime

Container image dipaksa:

```env
TZ=UTC
```

Timezone bukan build argument. Scheduler business timezone tetap dikontrol terpisah melalui `SCHEDULER_TIMEZONE` atau override per task.

## Shared Image, Per-Role Health

Image yang sama menjalankan beberapa process role:

```text
./server
./worker
./scheduler
./job-dead
./doctor
./migrate
./seed
```

Karena itu Dockerfile **tidak** mendefinisikan image-level healthcheck.

Deployment/Compose harus memasang probe sesuai role:

- HTTP server: `http://127.0.0.1:3000/health/live`
- worker: `http://127.0.0.1:9465/health/ready`
- scheduler: `http://127.0.0.1:9465/health/ready`

Worker/scheduler process health listener hanya bind ke loopback `127.0.0.1`; port default dikontrol oleh `PROCESS_HEALTH_PORT=9465`.

Worker readiness membutuhkan initialization selesai dan Redis client masih connected. Scheduler readiness aktif setelah scheduler registry berhasil divalidasi/start dan berubah unready saat draining.

## Graceful Stop Budget

Container stop grace period harus lebih panjang daripada internal shutdown budget.

Baseline Compose:

```text
app        25s
worker     40s
scheduler  25s
database   30s
redis      20s
```

Alasannya:

- HTTP dapat memakai drain delay + `SHUTDOWN_TIMEOUT_MS` + DB close
- worker job dapat berjalan sampai `WORKER_JOB_TIMEOUT_MS`
- scheduler menunggu active task sampai `SHUTDOWN_TIMEOUT_MS`

Jangan menurunkan orchestrator termination grace di bawah application shutdown budget tanpa mengubah timeout aplikasi secara konsisten.

## Non-Root and Privilege Boundary

Application process berjalan sebagai dedicated `appuser`.

Compose baseline mempertahankan:

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
read_only: true
tmpfs:
  - /tmp:size=16m,noexec,nosuid,nodev
pids_limit: 256
```

Service tidak membutuhkan privileged mode, host PID/network namespace, Linux capability tambahan, atau Docker socket.

## Resource and Log Bounds

Application roles memiliki memory/CPU baseline di development Compose:

- app: 512 MiB / 1 CPU
- worker: 512 MiB / 1 CPU
- scheduler: 256 MiB / 0.5 CPU

Angka production harus ditentukan dari profiling dan workload nyata.

Docker `json-file` log dibatasi:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

Ini mencegah log container tumbuh tanpa batas pada host.

## Network Segmentation

Compose memisahkan tiga trust zone:

```text
runtime  = application processes dengan outbound access
database = internal network untuk PostgreSQL/MySQL
queue    = internal network untuk Redis
```

Database hanya berada di `database`. Redis hanya berada di `queue`. One-shot migration/seeder hanya bergabung ke `database`, sedangkan app/worker/scheduler dapat bergabung ke runtime + dependency networks yang diperlukan.

Network segmentation adalah defense-in-depth, bukan pengganti authentication, database grants, Redis ACL, atau firewall/orchestrator policy.

## Network Exposure

Baseline Compose hanya publish HTTP app ke loopback host:

```text
127.0.0.1:3000:3000
```

Database, Redis, worker health, scheduler health, dan metrics process tidak dipublish ke host secara default.

Production exposure harus mengikuti reverse proxy, firewall, service mesh, atau orchestrator policy yang eksplisit.

## Data and Filesystem

Application root filesystem read-only.

Gunakan:

- relational database untuk business data
- Redis untuk queue/state sesuai desain
- object storage untuk media/file
- explicit volume hanya bila dibutuhkan

`/tmp` tersedia sebagai tmpfs kecil.

Migration dan seeder source tidak ikut runtime image.

Build menghasilkan standalone:

```text
./migrate
./seed
```

Migration/seeder modules di-bundle melalui static registries yang ikut compilation graph. `migrate create` dan `seed:create` memperbarui registry source; release check menolak registry yang tidak sinkron dengan file migration/seeder.

Compose menjalankan `./migrate up` sebagai one-shot dependency sebelum application roles start. Seeder tetap explicit/opt-in.

## Image Freshness

CI membangun image dengan:

```bash
docker build --pull ...
```

agar mutable base tag diperiksa ulang pada build.

Repository menyediakan `renovate.json` dengan preset `docker:pinDigests`. Setelah Renovate diaktifkan pada repository, Docker base/service image harus dipin ke digest dan digest update masuk sebagai PR reviewable, bukan dibekukan manual selamanya.

## Digest Pinning and Automated Updates

Repository memakai `renovate.json` untuk `main` dan `mysql-v8`.

Policy:
- Docker references dipin ke digest melalui `docker:pinDigests`
- GitHub Actions dipin ke immutable commit melalui `helpers:pinGitHubActionDigests`
- Alpine/PostgreSQL/MySQL/Redis mempertahankan tag line yang dipilih dan menerima rebuild/security refresh melalui digest PR
- Bun tetap pada minor line yang dipilih; patch release boleh diusulkan
- digest/action update tidak auto-merge dan harus melewati review + CI

Target bentuk setelah initial Renovate pin PR:

```text
alpine:3.22@sha256:<digest>
postgres:16-alpine@sha256:<digest>
mysql:8.0@sha256:<digest>
redis:7.2-alpine@sha256:<digest>
oven/bun:1.4.x-alpine@sha256:<digest>
```

`renovate.json` sendiri tidak menjalankan bot. Repository harus mengaktifkan Renovate GitHub App atau Renovate self-hosted. Sampai initial pin PR diterapkan, CI tetap memakai tag dan `docker build --pull`; setelah pinning, build menjadi reproducible terhadap digest yang direview.

Jangan menyalin digest manual dari dokumentasi atau hasil pencarian lama. Digest harus di-resolve langsung oleh registry-aware updater agar tidak membekukan artefak stale.

## CI Validation

Container validation baseline:

1. validate Compose configuration
2. build production image dengan `--pull`
3. verify runtime UID non-root
4. smoke-test HTTP liveness
5. scan final image dengan Trivy untuk HIGH/CRITICAL vulnerability yang sudah memiliki fix
6. generate SPDX JSON SBOM dari final image
7. run repository release guards untuk health ownership, migration packaging, stop grace, UTC, dan standalone build flags
