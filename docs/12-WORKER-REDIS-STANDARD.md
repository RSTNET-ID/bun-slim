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

## Redis Keys

Default:

```text
<WORKER_QUEUE_PREFIX>:<SERVICE_NAME>:<WORKER_QUEUE_NAME>:stream
<WORKER_QUEUE_PREFIX>:<SERVICE_NAME>:<WORKER_QUEUE_NAME>:dead
```

Consumer group:

```text
<SERVICE_NAME>:workers
```

Prefix harus unik per service/environment bila beberapa environment memakai Redis yang sama.

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

WORKER_QUEUE_NAME=default
WORKER_QUEUE_PREFIX=queue
WORKER_CONCURRENCY=2
WORKER_BLOCK_MS=1000
WORKER_JOB_TIMEOUT_MS=30000
WORKER_MAX_ATTEMPTS=3
WORKER_RETRY_BACKOFF_MS=1000
WORKER_STALE_AFTER_MS=60000
WORKER_RECLAIM_INTERVAL_MS=15000
```

## Local Development

Core HTTP + PostgreSQL:

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

Scheduler baseline sekarang tersedia melalui `Bun.cron()` di process terpisah. Lihat `docs/25-SCHEDULER-STANDARD.md`. Untuk durable execution, scheduler sebaiknya enqueue ke Redis Stream dan worker tetap memegang retry/idempotency. Untuk workflow DAG, delayed-job semantics kompleks, atau scheduler multi-replica tanpa single-leader constraint, evaluasi orchestrator/queue framework khusus.
