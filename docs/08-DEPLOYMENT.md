# 08 - Deployment Standard

## Container

Service harus:
- stateless
- non-root
- health-checkable
- graceful shutdown capable
- tidak menyimpan persistent business data di filesystem container

## Runtime Components

HTTP-only service:

```text
app
postgres
```

Worker-enabled service:

```text
app
worker
postgres
redis
```

App dan worker berasal dari image yang sama:

```text
./server   -> HTTP process
./worker   -> background worker process
```

Jangan menjalankan HTTP server dan worker loop di process yang sama. Lifecycle, scaling, resource limit, dan failure domain harus dapat diatur terpisah.

## Docker Compose

Core:

```bash
docker compose up --build
```

Worker overlay:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.worker.yml \
  up --build
```

Redis tidak diekspos ke host pada baseline compose.

## Shutdown

HTTP:
1. stop accepting new requests
2. drain in-flight requests
3. close DB pool
4. exit

Worker:
1. stop consuming new jobs
2. drain in-flight jobs
3. close Redis
4. close DB pool
5. exit

Pending Redis Stream message yang belum di-ACK dapat direclaim consumer lain setelah stale threshold.

## Database

PostgreSQL default.

Penggantian database harus terjadi di persistence boundary. Query/migration PostgreSQL-specific tidak harus dipaksa portable secara sintaksis.

## Redis

Worker pack menggunakan Bun native Redis client dan Redis Streams consumer groups.

Production:
- Redis tidak boleh exposed public
- gunakan credential aplikasi dengan least privilege
- pisahkan namespace environment/service
- aktifkan persistence/HA sesuai criticality queue
- monitor memory, pending entries, dead-letter stream, dan connection errors
- TLS digunakan bila Redis melewati network yang tidak sepenuhnya trusted

Queue dengan business-critical jobs tidak boleh bergantung pada ephemeral Redis tanpa recovery/persistence plan.

## Resource Sizing

Pisahkan resource limit app dan worker.

Worker concurrency harus diseimbangkan dengan:
- database pool
- downstream/provider limits
- CPU/memory
- expected job latency

Jangan otomatis menyamakan worker concurrency dengan jumlah CPU.
