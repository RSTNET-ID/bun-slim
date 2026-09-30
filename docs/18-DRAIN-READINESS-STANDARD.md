# 18 - Drain and Readiness Standard

## Goal

Saat deployment/restart, instance harus berhenti menerima traffic baru sebelum koneksi aktif diputus.

Baseline shutdown:

```text
SIGTERM/SIGINT
    |
    v
mark instance draining
    |
    v
/health/ready => 503
    |
    v
wait drain propagation delay
    |
    v
stop listener / drain in-flight
    |
    v
close DB
    |
    v
exit
```

## Configuration

```env
SHUTDOWN_DRAIN_DELAY_MS=1000
SHUTDOWN_TIMEOUT_MS=15000
```

`SHUTDOWN_DRAIN_DELAY_MS` memberi load balancer/reverse proxy kesempatan melihat readiness berubah sebelum listener ditutup.

Nilai 1000 ms hanyalah baseline. Sesuaikan dengan:
- health check interval
- service discovery propagation
- orchestrator behavior
- Nginx/load balancer retry policy

## Readiness

`GET /health/ready` mengembalikan 503 dengan code:

```text
SERVICE_DRAINING
```

segera setelah shutdown dimulai.

Pada kondisi draining, readiness tidak perlu melakukan dependency probe lagi.

## Liveness

`GET /health/live` tetap berarti process/HTTP hidup.

Jangan membuat liveness gagal hanya karena instance sedang draining. Orchestrator dapat salah menganggap graceful termination sebagai crash.

## Shutdown Deadline

Setelah drain delay selesai, Bun server menunggu in-flight request.

Jika melebihi `SHUTDOWN_TIMEOUT_MS`, koneksi aktif dipaksa tutup.

Orchestrator termination grace period harus lebih besar daripada:

```text
SHUTDOWN_DRAIN_DELAY_MS + SHUTDOWN_TIMEOUT_MS
```

tambahkan margin beberapa detik untuk cleanup process.

## Long Requests

Jangan menggunakan request HTTP sangat panjang sebagai pengganti worker.

Jika operation memang panjang:
- enqueue background job
- return accepted/job identifier
- process melalui worker

Graceful shutdown tidak seharusnya menjadi alasan mempertahankan request selama menit/jam.
