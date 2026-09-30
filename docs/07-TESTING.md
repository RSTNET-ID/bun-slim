# 07 - Testing Standard

Default test runner: `bun:test`.

## Test Layers

### Unit

Lokasi: `tests/unit/`

Fokus:
- service/business rules
- pure utility
- error mapping
- tidak memakai HTTP nyata
- tidak memakai database nyata

### Contract

Lokasi: `tests/contract/`

Fokus:
- request/response HTTP
- status code
- validation
- headers
- error contract
- routing

Contract test boleh menggunakan in-memory repository agar cepat dan deterministik.

### Integration

Lokasi: `tests/integration/`

Fokus:
- PostgreSQL repository nyata
- migration compatibility
- transaction behavior
- Redis worker bila digunakan
- external adapter bila test environment tersedia

Integration test database wajib memakai database/schema test terisolasi.

## Minimum Coverage per Feature

Test minimal:
- success path
- validation failure
- business failure
- dependency failure

Untuk worker/webhook/payment-like flow tambahkan:
- duplicate delivery
- idempotency
- retry
- timeout
- transaction rollback

## CI

Quality job:
- format
- lint
- typecheck
- unit test
- contract test
- build

Database integration job:
- start PostgreSQL
- apply migrations
- run `tests/integration/`
