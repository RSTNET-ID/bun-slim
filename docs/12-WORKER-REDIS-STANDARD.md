# 12 - Redis Worker Standard

## Scope

Redis hanya digunakan bila service membutuhkan background job/worker.

HTTP-only service **tidak wajib** mengaktifkan Redis.

Baseline worker menggunakan **Bun native RedisClient + Redis Streams consumer group**. Tidak ada BullMQ/ioredis dependency secara default.

Minimum Redis/Valkey compatibility mengikuti Bun native Redis client, yaitu Redis-compatible server 7.2+.

## Architecture

```text
HTTP / Bun.cron Scheduler / Event
        |
        v
     Producer
        |
        v
 Redis Stream
        |
        v
 Consumer Group
        |
        v
      Worker
        |
        v
 Service / Use Case
```

Worker memanggil service/use-case yang sama bila business logic-nya sama. Jangan copy-paste business logic ke worker.

## Why Streams

Jangan menggunakan Redis Pub/Sub untuk durable background job karena message yang tidak sedang didengar akan hilang.

Jangan menggunakan plain `BRPOP` sebagai reliability baseline karena item sudah dikeluarkan dari list sebelum handler berhasil.

Redis Streams consumer group menyediakan:
- pending entries
- consumer identity
- explicit ACK
- stale-message reclaim
- distribusi message antar worker replica

Delivery semantic baseline adalah **at-least-once**.

Karena itu handler **wajib idempotent** untuk operasi yang dapat menerima delivery ulang.

## Job Contract

```ts
interface JobEnvelope<TPayload> {
  job_id: string;
  job_type: string;
  version: number;
  created_at: string;
  attempt: number;
  payload: TPayload;
  request_id?: string;
}
```

Minimum field:
- `job_id`: idempotency/correlation identity
- `job_type`: routing handler
- `version`: contract version
- `created_at`: ISO timestamp
- `attempt`: current delivery attempt
- `payload`: business payload
- `request_id`: optional trace/correlation ID

## Redis Namespace and Keys

Semua Redis key harus berada di bawah satu root namespace:

```text
<REDIS_NAMESPACE>:<subsystem>:<resource>
```

Jika `REDIS_NAMESPACE` tidak diisi, runtime otomatis memakai:

```text
<SERVICE_NAME>:<APP_ENV>
```

Contoh:

```text
artavax:production
wati:staging
billing:development
```

Queue worker menggunakan:

```text
<REDIS_NAMESPACE>:queue:<WORKER_QUEUE_NAME>:stream
<REDIS_NAMESPACE>:queue:<WORKER_QUEUE_NAME>:dead
<REDIS_NAMESPACE>:queue:<WORKER_QUEUE_NAME>:workers
```

Dengan:

```env
SERVICE_NAME=artavax
APP_ENV=production
WORKER_QUEUE_NAME=default
```

hasilnya:

```text
artavax:production:queue:default:stream
artavax:production:queue:default:dead
artavax:production:queue:default:workers
```

Untuk deployment/site yang perlu isolasi tambahan, override:

```env
REDIS_NAMESPACE=artavax:production:idc1
```

Namespace mencegah **key collision**, tetapi bukan security boundary. Jika service yang tidak saling dipercaya berbagi Redis, gunakan Redis ACL/credential terpisah dan batasi key pattern, misalnya secara konseptual:

```text
~artavax:production:*
```

Database index Redis yang berbeda juga bukan pengganti ACL.

### Upgrade from Legacy Queue Keys

Format lama:

```text
queue:<SERVICE_NAME>:<WORKER_QUEUE_NAME>:stream
queue:<SERVICE_NAME>:<WORKER_QUEUE_NAME>:dead
```

tidak dibaca otomatis oleh format baru.

Sebelum rollout ke service yang sudah memiliki pending job:
1. hentikan producer lama
2. drain pending/retry/DLQ sesuai kebutuhan operasional
3. deploy producer + worker baru bersama
4. verifikasi key baru memakai namespace environment

Jangan mengganti namespace di tengah backlog aktif tanpa migration plan, karena Redis akan menganggapnya sebagai queue yang berbeda.

## Producer

Gunakan:

```ts
import { enqueueJob } from '@/worker/producer';

await enqueueJob(
  'notification.send',
  { notification_id: id },
  { requestId }
);
```

Jangan memasukkan secret, credential, atau payload sensitif yang tidak diperlukan ke job.

## Database Write + Enqueue Atomicity

Redis Streams memberi durable delivery setelah message berhasil masuk Redis, tetapi database commit dan Redis enqueue bukan satu transaksi.

Jika business write **harus** menghasilkan job/event dan kehilangan publish tidak dapat diterima, gunakan transactional outbox. Jangan melakukan:

```text
commit database
then enqueue Redis
```

sebagai reliability guarantee.

Lihat `docs/26-OUTBOX-IDEMPOTENCY-STANDARD.md`.

## Handler Registration

Register handler di `src/worker/registry.ts`.

```ts
export const jobHandlers: JobHandlerRegistry = {
  'notification.send': async (job, { signal }) => {
    await notificationService.send(job.payload, { signal });
  },
};
```

Hono `Context` tidak boleh masuk ke handler worker atau service.

## Reliability

### Success

```text
handler success
    |
    v
   XACK
    |
    v
XDEL cleanup
```

`XACK` adalah delivery boundary. Kegagalan cleanup `XDEL` tidak boleh menyebabkan job sukses di-retry.

### Retry

Jika handler gagal dan attempt masih di bawah limit:

1. original message tetap pending selama backoff
2. retry job baru ditambahkan ke stream
3. original message di-ACK
4. attempt dinaikkan

Retry menggunakan exponential backoff dengan cap 30 detik.

Karena crash dapat terjadi di antara operasi Redis, duplicate delivery tetap mungkin. Handler harus idempotent.

### Dead Letter

Setelah `WORKER_MAX_ATTEMPTS` tercapai, job dipindahkan ke dead-letter stream lalu original message di-ACK.

Unknown `job_type` dan malformed job juga masuk dead-letter.

Dead-letter stream harus dipantau dan memiliki prosedur replay/manual investigation sesuai domain service.

### DLQ Operations CLI

Starter menyediakan tooling operasional:

```bash
bun run job:dead:list -- --limit=20
bun run job:dead:show -- <stream-id>
bun run job:dead:show -- <stream-id> --payload
bun run job:dead:replay -- <stream-id>
bun run job:dead:purge -- --older-than=30d --limit=100 --force
```

Standalone production binary:

```bash
./job-dead list --limit=20
./job-dead show <stream-id>
./job-dead replay <stream-id> --force
./job-dead purge --older-than=30d --limit=100 --force
```

Production replay membutuhkan `--force`:

```bash
bun run job:dead:replay -- <stream-id> --force
```

Behavior:
- `list` menampilkan metadata bounded tanpa payload
- `show` menyembunyikan payload kecuali `--payload`
- `replay` mempertahankan `job_id` dan mereset `attempt=1`
- replay hanya diizinkan bila `job_type` saat ini memiliki handler terdaftar
- perpindahan DLQ -> main stream menggunakan Redis Lua script atomic agar entry yang sama tidak direplay dua operator
- `purge` selalu membutuhkan `--force`
- purge menggunakan `--older-than` dan batch `--limit`, bukan delete tak terbatas
- default list maksimum 100 entry; purge batch maksimum 1000 entry

Payload DLQ dapat mengandung business data. Jangan memakai `--payload` lalu menyalin output ke ticket/chat/log tanpa review sensitivitas data.

### Stale Job Recovery

Worker secara berkala menggunakan Redis pending-entry reclaim.

Message yang idle lebih lama dari `WORKER_STALE_AFTER_MS` dapat diambil consumer lain.

Atur stale threshold lebih besar daripada job duration normal agar job aktif tidak dicuri worker lain.

## Timeout and Cancellation

Handler menerima `AbortSignal`.

```ts
async (job, { signal }) => {
  await fetch(url, { signal });
}
```

Timeout worker memanggil `abort()`, tetapi library/dependency yang dipanggil handler juga harus menghormati signal tersebut.

Timeout saja tidak menjamin side effect berhenti. Karena itu operasi write tetap harus idempotent.

## Concurrency

`WORKER_CONCURRENCY` mengatur jumlah consumer loop dalam satu process.

Total concurrency:

```text
replica count × WORKER_CONCURRENCY
```

Jangan menaikkan concurrency tanpa mempertimbangkan:
- DB pool
- provider rate limit
- downstream capacity
- memory
- idempotency/concurrency rules

## Process Health

Worker membuka loopback-only health listener:

```text
GET http://127.0.0.1:9465/health/live
GET http://127.0.0.1:9465/health/ready
```

Port default dikontrol oleh `PROCESS_HEALTH_PORT=9465`.

Readiness baru menjadi 200 setelah Redis consumer group selesai diinisialisasi dan Redis client masih connected. Saat SIGTERM/SIGINT diterima, worker segera berubah menjadi not-ready sebelum berhenti mengambil pekerjaan baru.

Compose menggunakan `/health/ready`, bukan `kill -0 1`, sehingga status health mewakili worker runtime yang sudah diinisialisasi.

## Graceful Shutdown

Saat SIGTERM/SIGINT:

1. stop mengambil pekerjaan baru
2. tunggu pekerjaan aktif selesai/timeout
3. close Redis
4. close database pool
5. exit

Job yang sudah diambil tetapi belum di-ACK tetap berada di pending entries dan dapat direclaim kemudian.

## Environment

```env
WORKER_ENABLED=true
REDIS_URL=redis://redis:6379

# Optional. Defaults to <SERVICE_NAME>:<APP_ENV>.
# REDIS_NAMESPACE=artavax:production:idc1

WORKER_QUEUE_NAME=default
WORKER_CONCURRENCY=2
WORKER_BLOCK_MS=1000
WORKER_JOB_TIMEOUT_MS=30000
WORKER_MAX_ATTEMPTS=3
WORKER_RETRY_BACKOFF_MS=1000
WORKER_STALE_AFTER_MS=60000
WORKER_RECLAIM_INTERVAL_MS=15000
```

## Local Development

Core HTTP + MySQL 8:

```bash
docker compose up
```

Dengan worker + Redis:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.worker.yml \
  up --build
```

## When NOT to Use This Pack

Jangan aktifkan worker hanya karena service disebut microservice.

Worker masuk akal bila ada:
- pekerjaan asynchronous
- retryable external calls
- webhook follow-up
- notification
- reconciliation/background processing
- workload yang tidak seharusnya menahan HTTP response

Scheduler baseline tersedia melalui `Bun.cron()` pada process terpisah. Lihat `docs/25-SCHEDULER-STANDARD.md`. Durable work tetap masuk Redis Stream dan worker. Untuk workflow DAG, delayed-job semantics kompleks, atau scheduler multi-replica tanpa single-leader constraint, evaluasi orchestrator khusus.
