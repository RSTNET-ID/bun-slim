# 07 - Testing Standard

Default test runner: `bun:test`.

## Test Layers

### Unit

Lokasi: `tests/unit/`

Fokus:
- service/business rules
- pure utility
- error mapping
- tanpa HTTP nyata
- tanpa database nyata

### Contract

Lokasi: `tests/contract/`

Fokus:
- request/response HTTP
- status code
- validation
- headers
- error contract
- routing

Contract test boleh menggunakan in-memory repository.

### Integration

Lokasi: `tests/integration/`

Fokus:
- MySQL 8 repository nyata
- migration compatibility
- transaction behavior
- Redis worker bila digunakan
- external adapter bila test environment tersedia

Integration database wajib memakai database test terisolasi.

## Minimum Coverage

Minimal:
- success path
- validation failure
- business failure
- dependency failure

Worker/webhook/payment-like flow juga menguji duplicate delivery, idempotency, retry, timeout, dan transaction rollback.

## CI

Quality job:
- format
- lint
- typecheck
- unit test
- contract test
- build

Database integration job:
- start MySQL 8
- apply migrations
- run `tests/integration/`
