# 03 - API Standard

## Base Path

Default:

`/api/v1`

Health endpoints tidak perlu versioning:
- `GET /health`
- `GET /health/live`
- `GET /health/ready`

## Response

Sukses:

```json
{
  "data": {}
}
```

Error:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Resource not found",
    "request_id": "req_xxx"
  }
}
```

## Request ID

Gunakan `X-Request-ID` jika client mengirimkannya, atau generate UUID bila tidak tersedia.

Request ID diteruskan ke:
- structured log
- outbound request
- error response
- job/event metadata bila relevan

## Input Validation

Semua input network wajib divalidasi runtime:
- body
- params
- query
- headers
- webhook payload

TypeScript type bukan runtime validation.

## Timeout / Retry

Outbound request wajib memiliki timeout.

Retry hanya untuk transient failure dan hanya bila operation aman untuk diulang.

Write operation kritikal harus memiliki idempotency strategy.
