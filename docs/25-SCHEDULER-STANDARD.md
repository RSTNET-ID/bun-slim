# 25 - Scheduler Standard

## Baseline

Scheduler menggunakan **Bun.cron() in-process** di entrypoint `src/scheduler.ts`.

Scheduler berjalan sebagai process/container terpisah dari HTTP server dan worker.

```text
Bun.cron
   |
   v
Scheduler Task
   |
   +--> preferably enqueueJob(...)
   |
   v
Redis Stream
   |
   v
Worker
   |
   v
Service / Use Case
```

## Why Separate Process

Jangan register scheduler di HTTP server.

Alasannya:
- HTTP replica count tidak boleh menggandakan cron execution
- scheduler punya lifecycle dan deployment sendiri
- shutdown dan observability lebih jelas
- worker dan scheduler dapat diaktifkan hanya pada service yang membutuhkannya

## Timezone

Semua scheduler menggunakan UTC secara eksplisit:

```ts
Bun.cron(expression, handler, { tz: 'UTC' });
```

Jangan bergantung pada timezone host/container.

Jika kebutuhan bisnis menyebut WIB atau timezone lain, konversikan jadwal bisnis ke UTC atau buat keputusan architecture eksplisit. Baseline starter tetap UTC.

## Register Task

Tambahkan task di `src/scheduler/registry.ts`:

```ts
export const scheduledTasks: ScheduledTask[] = [
  {
    name: 'notification-digest',
    cron: '0 * * * *',
    async run() {
      await enqueueJob('notification.digest', {});
    },
  },
];
```

Nama task harus unik dan low-cardinality.

## Scheduler vs Worker

Default rule:

```text
scheduler decides WHEN
worker owns durable execution
service owns business rules
```

Scheduler task sebaiknya hanya:
- menentukan waktu
- membuat payload minimal
- enqueue durable job

Jangan copy business logic ke scheduler.

Long-running, retryable, payment-like, notification, reconciliation, settlement, webhook, atau provider work sebaiknya masuk worker.

## Reliability

Bun menjamin callback cron yang sama tidak overlap **dalam satu process**.

Jaminan tersebut tidak berlaku antar process/replica.

Baseline production:
- scheduler replica count = 1
- worker boleh scale horizontal
- job handler tetap idempotent

Jika scheduler harus multi-replica/HA, tambahkan distributed lease/leader election sebelum menaikkan replica count.

## Downtime and Missed Runs

In-process `Bun.cron()` tidak melakukan durable catch-up bila process mati pada waktu schedule.

Untuk pekerjaan yang secara bisnis **tidak boleh terlewat**:
- simpan schedule/run state di database, atau
- gunakan durable external scheduler/orchestrator, atau
- implement catch-up/reconciliation job

Jangan menganggap cron callback sebagai durable queue.

## Error Handling

Scheduler runner menangkap error task dan mencatat structured log.

Error satu task tidak boleh mematikan seluruh scheduler.

Retry business operation tetap menjadi tanggung jawab worker, bukan loop retry scheduler.

## Shutdown

SIGTERM/SIGINT:
1. stop semua CronJob agar tidak menerima fire baru
2. abort signal dikirim ke task aktif
3. tunggu task aktif sampai `SHUTDOWN_TIMEOUT_MS`
4. close Redis dan database pool
5. exit

Task harus menghormati `AbortSignal` bila melakukan I/O yang mendukung cancellation.

## Environment

```env
TZ=UTC
SCHEDULER_ENABLED=false
```

Scheduler disabled secara default.

Aktifkan hanya setelah minimal satu task didaftarkan.

## Commands

Development:

```bash
SCHEDULER_ENABLED=true bun run scheduler:dev
```

Production binary:

```bash
./scheduler
```

## Operational Rules

- satu scheduler replica sebagai default
- jangan pakai `setInterval()` untuk calendar scheduling
- jangan menjalankan scheduler dari setiap HTTP replica
- scheduler task name harus stabil
- schedule harus terdokumentasi
- task yang enqueue job harus mengikuti job versioning/idempotency rules
- metrik/log tidak boleh memakai timestamp/job ID sebagai label
