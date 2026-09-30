# 08 - Deployment Standard

## Container

Service harus:
- stateless
- non-root
- health-checkable
- graceful shutdown capable
- tidak menyimpan persistent data di filesystem container

## Runtime Components

Minimum HTTP-only service:

```text
app
postgres
```

Jika membutuhkan worker:

```text
app
worker
postgres
redis
```

App dan worker boleh berasal dari image yang sama dengan command/entrypoint berbeda.

## Shutdown

Tangani `SIGTERM` dan `SIGINT`.

Urutan:
1. stop accepting new work
2. drain in-flight request/job
3. close DB pool
4. close Redis connection
5. exit

## Database

PostgreSQL default.

Deployment config harus memungkinkan penggantian `DB_DRIVER` dan connection settings bila di kemudian hari service dipindahkan ke MySQL/MariaDB.
