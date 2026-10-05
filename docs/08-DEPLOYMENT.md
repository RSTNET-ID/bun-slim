# 08 - Deployment Standard

## Container

Service harus:
- stateless
- non-root
- health-checkable
- graceful shutdown capable
- tidak menyimpan persistent business data di filesystem container

## Runtime Components

HTTP-only service:

```text
app
postgres
```

Worker-enabled service:

```text
app
worker
postgres
redis
```

App dan worker berasal dari image yang sama:

```text
./server   -> HTTP process
./worker   -> background worker process
```

Jangan menjalankan HTTP server dan worker loop di process yang sama. Lifecycle, scaling, resource limit, dan failure domain harus dapat diatur terpisah.

## Docker Compose

Core:

```bash
docker compose up --build
```

Worker overlay:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.worker.yml \
  up --build
```

Redis tidak diekspos ke host pada baseline compose.

## Automatic Schema Migration

Compose baseline memakai one-shot `migrate` service:

```text
PostgreSQL healthy
      |
      v
./migrate up
      |
      v
exit 0
      |
      +--> app
      +--> worker
      +--> scheduler
```

Dependent service menggunakan `condition: service_completed_successfully`. Jika migration gagal, application roles tidak start.

Migration binary memakai lock database yang sudah ada, sehingga schema migration tetap serialized. Migration source dibundle melalui static registry ke standalone `./migrate`; runtime image tidak memerlukan folder TypeScript `database/`.

Seeder **tidak** ikut auto-run. Development Compose menyediakan profile eksplisit:

```bash
docker compose --profile seed run --rm seed
```

Production seeding tetap membutuhkan `--force` dan harus menjadi tindakan operasional yang disengaja.

### Production Orchestrator Rule

Auto-migrate berarti **satu pre-deploy migration job**, bukan migration di setiap application replica.

Untuk Docker Compose baseline, service `migrate` adalah job tersebut. Untuk Kubernetes/Nomad/ECS atau orchestrator lain, gunakan equivalent one-shot Job/task dan gate rollout aplikasi pada exit code 0.

Jangan memasukkan `./migrate up && ./server` ke entrypoint setiap replica. Database lock memang mencegah concurrent schema execution, tetapi replica startup akan tetap terikat pada migration lifecycle dan memperbesar failure domain deployment.

Production migration CLI mengizinkan `up` dan `status` secara normal. `down` membutuhkan `--force`, `refresh` tetap dilarang, dan `create` dilarang karena production image bukan workspace pengembangan.

## Pre-start Runtime Doctor

Production image membawa standalone `./doctor`.

Jalankan sebelum process utama menerima traffic:

```bash
./doctor && exec ./server
```

Worker/scheduler memakai environment final yang sama dengan process yang akan dijalankan:

```bash
WORKER_ENABLED=true ./doctor && exec ./worker
SCHEDULER_ENABLED=true ./doctor && exec ./scheduler
```

Untuk validasi image/config tanpa dependency network gunakan `./doctor --offline`.

Doctor adalah pre-start validation, bukan liveness probe periodik.

## Container Health and Stop Budget

Shared production image tidak memiliki image-level healthcheck karena binary yang sama dipakai untuk HTTP, worker, dan scheduler.

Probe ditentukan per role:

```text
server    -> http://127.0.0.1:3000/health/live
worker    -> http://127.0.0.1:9465/health/ready
scheduler -> http://127.0.0.1:9465/health/ready
```

Worker/scheduler health listener hanya bind ke loopback container dan tidak dipublish ke host.

Baseline stop grace Compose:

```text
app        25s
worker     40s
scheduler  25s
postgres   30s
redis      20s
```

Grace period orchestrator harus lebih besar daripada internal drain/job timeout. Jangan membiarkan Docker mengirim SIGKILL lebih cepat daripada `SHUTDOWN_TIMEOUT_MS` atau `WORKER_JOB_TIMEOUT_MS`.

## Shutdown

HTTP:
1. stop accepting new requests
2. drain in-flight requests
3. close DB pool
4. exit

Worker:
1. stop consuming new jobs
2. drain in-flight jobs
3. close Redis
4. close DB pool
5. exit

Pending Redis Stream message yang belum di-ACK dapat direclaim consumer lain setelah stale threshold.

## Database

PostgreSQL default.

Penggantian database harus terjadi di persistence boundary. Query/migration PostgreSQL-specific tidak harus dipaksa portable secara sintaksis.

## Redis

Worker pack menggunakan Bun native Redis client dan Redis Streams consumer groups.

Production:
- Redis tidak boleh exposed public
- gunakan credential aplikasi dengan least privilege
- pisahkan namespace environment/service
- aktifkan persistence/HA sesuai criticality queue
- monitor memory, pending entries, dead-letter stream, dan connection errors
- TLS digunakan bila Redis melewati network yang tidak sepenuhnya trusted

Queue dengan business-critical jobs tidak boleh bergantung pada ephemeral Redis tanpa recovery/persistence plan.

## Resource Sizing

Pisahkan resource limit app dan worker.

Worker concurrency harus diseimbangkan dengan:
- database pool
- downstream/provider limits
- CPU/memory
- expected job latency

Jangan otomatis menyamakan worker concurrency dengan jumlah CPU.

## Drain Before Stop

Saat termination, instance terlebih dahulu berubah menjadi not-ready, menunggu `SHUTDOWN_DRAIN_DELAY_MS`, lalu HTTP listener dihentikan.

Pastikan load balancer/orchestrator memiliki health check dan grace period yang konsisten dengan lifecycle tersebut.

## Container Runtime Security

App dan worker baseline:
- non-root
- no-new-privileges
- all Linux capabilities dropped
- read-only root filesystem
- small `/tmp` tmpfs
- bounded PID count

Production runtime image hanya membawa package OS minimum dan compiled Bun binaries. Bun runtime hanya diperlukan pada build stage.

CI harus membangun image production dan menjalankan liveness smoke test.
