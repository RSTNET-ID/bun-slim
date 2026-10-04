# 26 - Transactional Outbox and Idempotency Standard

## Purpose

Redis Streams memberi durable worker delivery, tetapi **database transaction dan Redis enqueue bukan satu transaksi**.

Failure mode klasik:

```text
BEGIN DB transaction
  |
  +--> business write succeeds
COMMIT
  |
  X Redis enqueue fails
```

Hasilnya: state bisnis sudah berubah tetapi background job/event tidak pernah terbit.

Untuk side effect yang wajib mengikuti database commit, gunakan transactional outbox.

## When Outbox Is Required

Gunakan outbox bila semua kondisi berikut benar:

- business state ditulis ke database
- setelah commit harus ada job/event yang diterbitkan
- kehilangan job/event dapat membuat state bisnis tidak konsisten
- retry dari caller tidak cukup atau tidak dapat dijamin

Contoh:
- payment accepted -> settlement job
- order created -> fulfillment job
- invoice posted -> notification/event
- reconciliation record -> downstream processing
- webhook state committed -> delivery job

Outbox **tidak wajib** untuk:
- fire-and-forget telemetry
- cache invalidation yang boleh hilang
- scheduler yang hanya enqueue pekerjaan periodik tanpa business DB write pada transaksi yang sama
- pekerjaan yang memang dapat direkonstruksi sepenuhnya melalui reconciliation

## Transaction Boundary

Business write dan outbox insert berada dalam database transaction yang sama:

```text
BEGIN
  business table write
  outbox row insert
COMMIT
```

Jangan melakukan Redis/network call di dalam database transaction untuk mencoba membuatnya "atomic". Itu hanya memperpanjang lock dan tetap tidak membuat dua sistem menjadi satu transaksi.

## Suggested Outbox Contract

Service yang mengadopsi outbox minimal menyimpan:

```text
id
event_type / job_type
version
payload
created_at
available_at
published_at nullable
attempts
last_error nullable
```

Tambahkan aggregate/business identity bila dibutuhkan untuk idempotency atau ordering.

Payload harus:
- versioned
- minimal
- tidak membawa secret
- cukup untuk worker mengambil data terbaru bila desain membutuhkan read-after-delivery

## Dispatcher

Dispatcher membaca row unpublished dalam batch terbatas.

Baseline concurrency pattern:

```sql
SELECT ...
FROM outbox
WHERE published_at IS NULL
  AND available_at <= now
ORDER BY created_at, id
LIMIT ?
FOR UPDATE SKIP LOCKED
```

Kemudian:
1. publish ke Redis Stream
2. setelah publish berhasil, tandai outbox row published
3. commit transaction dispatcher

Karena crash dapat terjadi **setelah Redis publish tetapi sebelum published_at tersimpan**, duplicate publish tetap mungkin.

Karena itu outbox memberi **at-least-once publish**, bukan exactly-once.

## Consumer Idempotency

Worker tetap wajib idempotent.

Gunakan salah satu sesuai domain:
- unique business constraint
- processed-message/inbox table
- idempotency key
- compare-and-set state transition
- natural business invariant

Jangan menganggap Redis stream ID atau request ID sebagai satu-satunya business uniqueness constraint.

## Scheduler Interaction

Default:

```text
Bun.cron
   |
   v
enqueue durable job
   |
   v
worker
```

Jika scheduler hanya menentukan waktu, direct enqueue ke Redis cukup.

Jika scheduler sekaligus mengubah business state yang **harus** menghasilkan job, gunakan service transaction + outbox, bukan DB write lalu enqueue terpisah.

Untuk schedule yang tidak boleh terlewat saat scheduler downtime, gunakan durable schedule/run ledger atau reconciliation; outbox sendiri tidak menggantikan missed-run tracking.

## Retry and Poison Rows

Dispatcher retry harus:
- bounded/backoff
- menyimpan attempts
- menyimpan last_error yang sudah disanitasi
- memiliki operational threshold/alert
- tidak spin tanpa delay pada row yang selalu gagal

Jangan memasukkan credential atau raw provider response sensitif ke last_error.

## Cleanup

Published outbox rows harus memiliki retention policy.

Jangan menyimpan outbox sukses selamanya hanya karena storage hari ini masih murah. Pilih retention berdasarkan kebutuhan audit/replay service.

Delete/archive harus batch-bounded agar tidak membuat lock/I/O spike.

## Database Notes

PostgreSQL dan MySQL 8 sama-sama dapat menerapkan pattern ini di persistence boundary.

SQL schema/index dan detail locking boleh database-specific. Business/service contract tidak perlu mengetahui dialect.

Recommended index dimulai dari access pattern dispatcher, misalnya unpublished + available/order fields. Validasi dengan query plan pada workload nyata.

## Operational Metrics

Bila outbox diadopsi, minimum signal:
- unpublished row count
- oldest unpublished age
- publish success/failure count
- retry count
- poison/stuck row count

Alert paling berguna biasanya **oldest unpublished age**, bukan sekadar jumlah row.

## Rules

- jangan dual-write DB + Redis bila kehilangan event tidak dapat diterima
- outbox insert harus berada dalam transaction business write
- dispatcher harus bounded
- consumer tetap idempotent
- exactly-once tidak dijanjikan
- payload/version contract harus backward-compatible selama rolling deployment
- cleanup/retention harus eksplisit
