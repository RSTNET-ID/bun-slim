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
  -> server / worker / scheduler / job-dead / doctor
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

Folder `database/` masih ikut runtime image karena migration/seeder runner saat ini memerlukan migration/seed assets. Menghilangkan folder ini membutuhkan packaging migration/seeder yang terpisah dan tidak dilakukan hanya demi kosmetik image size.

## Image Freshness

CI membangun image dengan:

```bash
docker build --pull ...
```

agar mutable base tag diperiksa ulang pada build.

Untuk production supply-chain yang lebih ketat, pin image ke digest dan gunakan automated dependency update agar digest tidak membeku selamanya.

## CI Validation

Container validation baseline:

1. validate Compose configuration
2. build production image dengan `--pull`
3. verify runtime UID non-root
4. smoke-test HTTP liveness
5. run repository release guards untuk health ownership, stop grace, UTC, dan standalone build flags

Image vulnerability scanning dan SBOM tetap direkomendasikan pada release pipeline bila scanner tersedia.
