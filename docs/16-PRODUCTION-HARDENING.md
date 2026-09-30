# 16 - Production Hardening

## Bun Server Baseline

Runtime server memiliki explicit limits:

```env
SERVER_HOST=0.0.0.0
SERVER_IDLE_TIMEOUT_SECONDS=15
MAX_REQUEST_BODY_BYTES=1048576
SHUTDOWN_TIMEOUT_MS=15000
SECURITY_HEADERS_ENABLED=true
```

Bun `maxRequestBodySize` digunakan sebagai hard limit request body di level server.

Naikkan limit hanya bila endpoint/domain memang memerlukan payload lebih besar.

## Development Error Pages

Bun development mode hanya aktif ketika:

```text
APP_ENV=development
```

Production/staging tidak boleh mengirim Bun development error page yang dapat mengekspos source path atau stack detail.

## Security Headers

API baseline:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: no-referrer
- Permissions-Policy: deny camera/microphone/geolocation
- X-Permitted-Cross-Domain-Policies: none
- Content-Security-Policy: deny-all baseline

HSTS tidak dipaksa di aplikasi starter karena terminasi TLS sering berada di Nginx/load balancer.

Jika TLS berakhir di edge, HSTS sebaiknya dikelola di edge tersebut.

## Graceful Shutdown

SIGTERM/SIGINT:

1. stop accepting new HTTP connections
2. tunggu in-flight requests
3. bila melebihi `SHUTDOWN_TIMEOUT_MS`, force-close active connections
4. close database pool
5. exit

Orchestrator termination grace period harus lebih besar daripada `SHUTDOWN_TIMEOUT_MS` agar aplikasi sempat drain.

## Request Body Limit

Default:

```text
1 MiB
```

Service upload/file ingestion harus menggunakan desain khusus:
- object storage/direct upload bila relevan
- endpoint limit yang memang dihitung
- streaming bila diperlukan
- MIME/content validation

Jangan menaikkan global body limit menjadi ratusan MB hanya untuk satu endpoint.

## Dependency Audit

CI menjalankan:

```bash
bun audit --prod --audit-level=high
```

High/critical production dependency vulnerability harus menggagalkan CI kecuali terdapat documented exception dan review security.

Jangan menjalankan automatic major upgrade di CI.

## Reverse Proxy

Jika service berada di belakang Nginx/load balancer:
- tetap pertahankan application body limit
- set proxy timeout sesuai SLA
- jangan percaya client-supplied forwarding headers tanpa trusted proxy policy
- metrics endpoint tetap internal
- TLS/HSTS policy dikelola secara konsisten di edge
