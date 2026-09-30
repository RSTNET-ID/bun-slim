# 02 - Internal Design

## Struktur Direktori

```text
src/
├── app.ts
├── server.ts
├── config/
│   ├── env.ts
│   └── index.ts
├── database/
│   ├── client.ts
│   ├── transaction.ts
│   └── health.ts
├── redis/                 # optional
│   ├── client.ts
│   └── health.ts
├── workers/               # optional
│   ├── worker.ts
│   └── jobs/
├── modules/
│   └── example/
│       ├── example.route.ts
│       ├── example.handler.ts
│       ├── example.service.ts
│       ├── example.repository.ts
│       ├── example.validation.ts
│       └── example.types.ts
├── shared/
│   ├── errors/
│   ├── middleware/
│   ├── logger/
│   └── http/
└── routes/
    ├── health.route.ts
    └── index.ts

database/
├── migrate.ts             # migration runner
└── migrations/            # file migration <timestamp>_<name>.ts

tests/
├── unit/                  # unit test (no DB, no HTTP)
│   ├── modules/
│   │   └── example/
│   │       └── example.service.test.ts
│   └── shared/
│       └── http/
│           └── cursor-pagination.test.ts
└── integration/           # integration test (HTTP + in-memory repo)
    └── modules/
        └── example/
            └── example.http.test.ts
```

Test file **tidak** berada di dalam `src/`. Test dipisah berdasarkan jenis:
- `tests/unit/` — unit test, hanya business logic, tanpa DB.
- `tests/integration/` — test HTTP end-to-end dengan in-memory repository.

Folder `redis/` dan `workers/` hanya ada jika dibutuhkan.


## HTTP Boundary

`app.ts`:
- global middleware
- routes
- not-found handler
- global error handler

`server.ts`:
- bootstrap
- start server
- signal handling
- graceful shutdown

## Handler

Handler boleh:
- membaca params/query/body/header
- membaca principal/auth context
- memanggil service
- mapping result ke HTTP response

Handler tidak boleh:
- menulis SQL
- memanggil Redis langsung untuk business workflow
- menjalankan business rule besar

## Service

Service berisi:
- business rules
- orchestration
- transaction ownership
- coordination repository/adapter

## Repository

Repository dibuat hanya untuk module yang membutuhkan persistence.

Hindari `BaseRepository<T>`, `GenericRepository`, atau abstraction generik sebelum memang ada kebutuhan nyata.
