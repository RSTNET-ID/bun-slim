# 14 - Outbound HTTP Standard

## Goal

Semua komunikasi HTTP keluar harus memiliki timeout, cancellation, request correlation, dan retry policy yang eksplisit.

Gunakan `fetchWithPolicy()` dari `src/shared/http/client.ts` sebagai baseline.

## Default Policy

Environment:

```env
OUTBOUND_HTTP_TIMEOUT_MS=5000
OUTBOUND_HTTP_MAX_RETRIES=2
OUTBOUND_HTTP_RETRY_BASE_MS=100
```

Default retry hanya berlaku untuk method aman:

- GET
- HEAD
- OPTIONS

Transient status baseline:

- 408
- 425
- 429
- 500
- 502
- 503
- 504

Network failure juga dapat di-retry selama operation memenuhi retry policy.

## Write Requests

POST/PATCH tidak di-retry secara default.

Jika business requirement membutuhkan retry write:

1. caller harus mengaktifkan `retryUnsafe: true`
2. request POST/PATCH wajib memiliki `Idempotency-Key`
3. downstream/provider harus mendukung semantics idempotency tersebut
4. local business state tetap harus menangani duplicate callback/result

Jangan menganggap retry + idempotency key berarti exactly-once.

## Request Correlation

Bila request berasal dari inbound HTTP:

```ts
await fetchWithPolicy(url, requestInit, {
  dependency: 'bank-provider',
  requestId,
});
```

`X-Request-ID` otomatis diteruskan bila caller belum menentukannya sendiri.

## Dependency Naming

`dependency` harus berupa logical dependency dengan cardinality rendah, misalnya:

- bri-h2h
- notification-service
- crm-api

Jangan menggunakan:
- full URL
- tenant ID
- transaction ID
- user-supplied hostname

Nama dependency digunakan untuk logging dan metrics.

## Cancellation

Caller dapat memberikan `signal` melalui `RequestInit`.

Cancellation dari request/worker harus dipropagasi ke outbound request bila operation memang harus berhenti bersama parent operation.

## Logging

Retry log boleh memuat:
- dependency
- method
- status
- attempt
- max attempts
- request ID
- error class/name

Jangan log:
- full URL dengan query
- Authorization
- API key
- token
- provider secret
- raw request/response payload sensitif

## Adapter Boundary

Provider-specific mapping tetap berada di adapter/provider module.

`fetchWithPolicy()` hanya menangani transport policy. Ia tidak boleh:
- memahami response bisnis provider
- memutuskan status transaksi
- menulis database
- menjalankan compensation
