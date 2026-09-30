# 15 - Metrics Standard

## Scope

Starter menyediakan metrics Prometheus-compatible yang ringan tanpa dependency monitoring tambahan.

Metrics disabled secara default:

```env
METRICS_ENABLED=false
```

Jika aktif:

```text
GET /metrics
```

Endpoint menghasilkan Prometheus text exposition format.

## Security

`/metrics` bukan endpoint publik untuk end user.

Production sebaiknya membatasi endpoint melalui:
- private network
- reverse proxy allowlist
- service mesh policy
- monitoring network

Jangan memasukkan secret atau data pelanggan ke label.

## Cardinality Rules

Allowed label examples:
- HTTP method
- status class: 2xx, 4xx, 5xx
- logical dependency name

Forbidden/default-avoid:
- path mentah
- URL
- request ID
- tenant ID
- transaction ID
- user ID
- IP client
- exception message

High-cardinality labels membuat metrics backend membengkak tanpa belas kasihan.

## Baseline Metrics

HTTP:

```text
service_http_requests_in_flight
service_http_requests_total
service_http_request_duration_seconds_count
service_http_request_duration_seconds_sum
```

Outbound HTTP:

```text
service_outbound_http_requests_total
service_outbound_http_request_duration_seconds_count
service_outbound_http_request_duration_seconds_sum
```

## Request Metrics

Inbound request dikelompokkan berdasarkan:
- method
- status class

Path sengaja tidak menjadi label baseline.

Jika sebuah service benar-benar membutuhkan route-level metrics, gunakan route template yang bounded, bukan raw URL.

## Outbound Metrics

Outbound request dikelompokkan berdasarkan:
- dependency
- method
- status class/network_error

`dependency` wajib logical name yang bounded.

## Future Extension

OpenTelemetry, histogram buckets, RED/USE dashboards, dan tracing dapat ditambahkan kemudian bila service memerlukannya.

Jangan memaksa tracing stack ke setiap microservice starter sebelum ada backend collector dan operational ownership yang jelas.
