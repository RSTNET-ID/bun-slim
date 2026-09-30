# 06 - Observability

## Logging

Minimal structured log fields:
- timestamp
- level
- service
- environment
- request_id
- method
- path
- status
- duration_ms

Business fields bila relevan:
- tenant_id
- transaction_id
- provider
- event
- job_id

## Health

`/health/live`:
- process hidup
- HTTP server merespons

Jangan menjadikan database sebagai liveness dependency.

`/health/ready`:
- PostgreSQL bila service tidak dapat bekerja tanpa DB
- Redis bila service membutuhkan worker/queue untuk operasi kritikal
- dependency esensial lain

## Worker Observability

Jika worker digunakan, minimal log:
- job_id
- job_type
- attempt
- processing_ms
- success/failure
- error_code

Metrics Prometheus-compatible tersedia sebagai optional baseline melalui `METRICS_ENABLED=true`.

Baseline metrics:
- HTTP requests/in-flight/duration
- outbound HTTP attempts/duration

Labels harus bounded dan low-cardinality. Raw path, URL, request ID, tenant ID, dan transaction ID tidak boleh menjadi baseline metric label.

Tracing/OpenTelemetry tetap optional dan hanya ditambahkan bila collector/backend serta operational ownership tersedia.
