# 12 - Redis Worker Standard

## Scope

Redis hanya wajib bila service memiliki worker/background job.

## Architecture

```text
HTTP / Scheduler / Event
        |
        v
     Producer
        |
        v
      Redis
        |
        v
      Worker
        |
        v
      Service
```

## Job Contract

Setiap job minimal memiliki:
- job_id
- job_type
- created_at
- payload
- request_id/correlation_id bila ada
- version

## Reliability

Setiap worker harus menentukan:
- concurrency
- timeout
- max attempts
- retry/backoff
- idempotency strategy
- duplicate handling
- failed job policy
- graceful shutdown

## Rule

Worker memanggil service/use-case yang sama jika logic bisnisnya sama. Jangan copy-paste business logic ke worker.

## Redis Usage

Redis worker sebaiknya memiliki namespace/prefix per service.

Credential service dibatasi sesuai kebutuhan aplikasi dan tidak menggunakan administrative credential.
