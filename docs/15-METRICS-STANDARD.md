# 15 - Metrics Standard

## Scope

Starter menyediakan metrics Prometheus-compatible yang ringan tanpa dependency monitoring tambahan.

Metrics disabled secara default:

```env
METRICS_ENABLED=false
METRICS_HOST=0.0.0.0
METRICS_PORT=9464
```

Saat `METRICS_ENABLED=true`, `METRICS_TOKEN` wajib diisi minimal 24 karakter. Authorization helper juga fail-closed: token yang tidak tersedia selalu menghasilkan unauthorized.

## Endpoints by Process

HTTP server menyajikan `GET /metrics` pada port aplikasi `PORT`.

Worker dan scheduler adalah process terpisah. Keduanya menjalankan listener metrics sendiri pada:

```text
http://METRICS_HOST:METRICS_PORT/metrics
```

Dalam deployment container, worker dan scheduler boleh memakai nomor port internal yang sama karena berada di network namespace berbeda. Jika dua process dijalankan pada host namespace yang sama, gunakan port metrics yang berbeda.

## Process Health Separation

Worker/scheduler process health memakai listener loopback terpisah pada `PROCESS_HEALTH_PORT=9465`.

Metrics tetap memakai `METRICS_HOST:METRICS_PORT` dan dapat membutuhkan bearer authentication. Jika metrics aktif, `METRICS_PORT` dan `PROCESS_HEALTH_PORT` tidak boleh sama.

Health listener tidak membawa metrics dan tidak dipublish ke host pada baseline Compose.

## Security

`/metrics` bukan endpoint publik untuk end user. Authorization memakai:

```text
Authorization: Bearer <METRICS_TOKEN>
```

Production wajib membatasi metrics melalui private network, reverse proxy allowlist, service mesh policy, atau monitoring network. Bearer token adalah lapisan tambahan, bukan alasan untuk mempublikasikan endpoint metrics ke Internet.

Jangan memasukkan secret atau data pelanggan ke label.

## Cardinality Rules

Allowed label examples:
- HTTP method
- status class
- logical dependency name
- bounded job type
- bounded scheduler task name
- bounded outcome/result

Hindari raw path, URL, request ID, tenant ID, transaction ID, user ID, client IP, dan exception message sebagai label.

## Baseline Metrics

Process:

```text
service_process_info{component="http|worker|scheduler"}
```

HTTP:

```text
service_http_requests_in_flight
service_http_requests_total
service_http_request_duration_seconds_count
service_http_request_duration_seconds_sum
```

Outbound:

```text
service_outbound_http_requests_total
service_outbound_http_request_duration_seconds_count
service_outbound_http_request_duration_seconds_sum
```

Worker:

```text
service_worker_jobs_in_flight
service_worker_jobs_total
service_worker_job_duration_seconds_count
service_worker_job_duration_seconds_sum
service_worker_reclaimed_total
```

Scheduler:

```text
service_scheduler_tasks_in_flight
service_scheduler_runs_total
service_scheduler_run_duration_seconds_count
service_scheduler_run_duration_seconds_sum
```

## Worker Metrics

Job worker dikelompokkan berdasarkan `job_type` dan hasil bounded: `success`, `retry`, `dead_letter`, `abandoned`, `internal_error`, `invalid_payload`, atau `unknown_type`.

## Scheduler Metrics

Scheduler mencatat callback aktif, hasil `success|error`, dan durasi berdasarkan nama task yang sudah divalidasi. Task name harus stabil dan low-cardinality.

## Lifecycle

Listener metrics worker/scheduler dimulai oleh entrypoint process dan dihentikan saat graceful shutdown.

## Future Extension

OpenTelemetry, histogram buckets, RED/USE dashboards, dan tracing dapat ditambahkan bila service memerlukannya dan backend observability sudah memiliki operational ownership yang jelas.
