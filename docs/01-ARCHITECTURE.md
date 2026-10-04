# 01 - Architecture

## Prinsip

```text
HTTP
  |
  v
Route
  |
  v
Handler
  |
  v
Service / Use Case
  |\
  | +--> Repository
  | +--> External Adapter
  | +--> Redis Worker/Queue (optional)
  v
Response
```

## Dependency Direction

`route -> handler -> service -> repository/adapter`

Hono tidak boleh bocor ke business layer.

## Database Architecture

Branch ini menggunakan MySQL 8 sebagai persistence baseline.

```text
Service
  |
  v
Repository Contract / Repository Module
  |
  v
MySQL 8 implementation
  |
  v
Bun.SQL
```

Service/domain tidak boleh bergantung langsung pada detail dialect. Yang database-specific tetap berada di repository, migration, index strategy, database client, dan integration test.

Tidak perlu membuat generic repository framework.

## Worker Architecture

Worker bersifat optional. Jika dibutuhkan, Redis Streams tetap menjadi baseline queue/worker.
