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

Runtime application dan database tetap menggunakan UTC. **Timezone scheduler terpisah dari runtime timezone.**

Default scheduler timezone:

```env
TZ=UTC
SCHEDULER_TIMEZONE=UTC
```

Untuk jadwal bisnis Indonesia:

```env
TZ=UTC
SCHEDULER_TIMEZONE=Asia/Jakarta
```

`SCHEDULER_TIMEZONE` harus berupa IANA timezone yang valid. Contoh:
- `UTC`
- `Asia/Jakarta`
- `Asia/Makassar`
- `Asia/Jayapura`
- `America/New_York`
- `Europe/London`

Scheduler runner meneruskan timezone secara eksplisit:

```ts
Bun.cron(expression, handler, { tz: timezone });
```

Jangan bergantung pada timezone host/container.

### Per-task timezone

Task dapat override default scheduler timezone:

```ts
export const scheduledTasks: ScheduledTask[] = [
  {
    name: 'daily-reconciliation-wib',
    cron: '0 1 * * *',
    timezone: 'Asia/Jakarta',
    async run({ timezone }) {
      await enqueueJob('reconciliation.daily', { timezone });
    },
  },
  {
    name: 'utc-maintenance',
    cron: '30 2 * * *',
    timezone: 'UTC',
    async run() {
      await enqueueJob('maintenance.run', {});
    },
  },
];
```

Resolution rule:

```text
task.timezone
    ↓ fallback
SCHEDULER_TIMEZONE
```

Jadi `0 1 * * *` dengan `Asia/Jakarta` berarti pukul **01:00 WIB**, walaupun container dan database tetap UTC.

## Register Task

Tambahkan task di `src/scheduler/registry.ts`:

```ts
export const scheduledTasks: ScheduledTask[] = [
  {
    name: 'notification-digest',
    cron: '0 8 * * *',
    timezone: 'Asia/Jakarta',
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
SCHEDULER_TIMEZONE=UTC
```

Scheduler disabled secara default.

Aktifkan hanya setelah minimal satu task didaftarkan.

## Commands

Development dengan default UTC:

```bash
SCHEDULER_ENABLED=true bun run scheduler:dev
```

Development dengan WIB:

```bash
SCHEDULER_ENABLED=true \
SCHEDULER_TIMEZONE=Asia/Jakarta \
bun run scheduler:dev
```

Production binary:

```bash
./scheduler
```

## Operational Rules

- satu scheduler replica sebagai default
- runtime/database tetap UTC
- scheduler timezone menggunakan IANA timezone yang tervalidasi
- per-task timezone boleh override `SCHEDULER_TIMEZONE`
- jangan pakai `setInterval()` untuk calendar scheduling
- jangan menjalankan scheduler dari setiap HTTP replica
- scheduler task name harus stabil
- schedule dan timezone harus terdokumentasi
- task yang enqueue job harus mengikuti job versioning/idempotency rules
- metrik/log tidak boleh memakai timestamp/job ID sebagai label
