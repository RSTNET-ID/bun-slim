# 01 - Architecture

## Prinsip

Arsitektur default dibuat sesederhana mungkin.

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

```text
route -> handler -> service -> repository/adapter
```

Aturan:
- Route: deklarasi endpoint dan middleware.
- Handler: boundary HTTP.
- Service: business rules/orchestration.
- Repository: persistence.
- Adapter/provider: integrasi eksternal.
- Worker: proses asynchronous/background.

Hono tidak boleh bocor ke business layer.

## Database Architecture

PostgreSQL adalah default database untuk starter.

Namun service/domain tidak boleh bergantung langsung pada detail PostgreSQL jika hal tersebut bisa dihindari.

Target:

```text
Service
  |
  v
Repository Contract / Repository Module
  |
  +--> PostgreSQL implementation (default)
  +--> MySQL implementation (future, jika dibutuhkan)
```

Tidak perlu membuat generic repository framework. Abstraction dibuat hanya di boundary yang nyata.

## Worker Architecture

Worker bersifat optional.

Jika service membutuhkan background processing:

```text
Producer
   |
   v
Redis
   |
   v
Worker
   |
   +--> Service
   +--> Repository
   +--> External Adapter
```

Redis digunakan sebagai backend worker/job secara default.

Service HTTP yang tidak memiliki background processing tidak wajib membawa Redis.
