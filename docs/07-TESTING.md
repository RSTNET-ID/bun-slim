# 07 - Testing Standard

Default test runner: `bun:test`.

## Unit Test

Fokus pada:
- service/business rules
- pure utility
- error mapping

## Integration Test

Fokus pada:
- HTTP endpoint
- PostgreSQL repository
- transaction
- Redis worker bila digunakan
- external adapter contract

## Minimum Coverage per Feature

Test:
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

Database integration test harus menggunakan schema/database test terisolasi.
