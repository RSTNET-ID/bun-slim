# 05 - Security Standard

Minimum baseline:
- runtime input validation
- authentication bila diperlukan
- authorization terpisah dari authentication
- request/body size limit
- timeout
- safe error responses
- secret isolation
- non-root container
- least privilege DB/Redis credential
- no secrets in logs

Jangan log:
- password
- Authorization header
- API key
- access token
- refresh token
- DB credential
- Redis credential
- provider secret
- payload sensitif yang tidak diperlukan

## PostgreSQL

Gunakan user database khusus per service bila memungkinkan.

Hak akses minimum sesuai schema/table yang dimiliki service.

## Redis Worker

Redis worker credential harus terpisah dari credential administratif.

Jika Redis hanya dipakai internal, jangan expose ke internet/public interface.

## HTTP Runtime

Server baseline membatasi request body dan mengaktifkan API security headers.

Jangan menonaktifkan limit/header hanya untuk menyelesaikan masalah integrasi tanpa memahami exposure yang dibuka.

## Outbound Requests

Retry POST/PATCH membutuhkan Idempotency-Key.

Jangan memasukkan raw URL/query atau credential ke retry/error log.

## Dependency Supply Chain

CI menjalankan production dependency audit untuk severity high/critical.

## Tenant Trust Boundary

Tenant/company/account identifier dari client adalah requested scope, bukan bukti authorization.

Gunakan authenticated principal + explicit tenant authorization sebelum menyimpan tenant context.

## Proxy Headers

Jangan mempercayai `X-Forwarded-For` atau `X-Real-IP` untuk authorization/rate limiting bila request dapat mencapai service tanpa trusted proxy yang mengontrol header tersebut.

## Container Runtime

Production app/worker dijalankan non-root dengan no-new-privileges, capability drop, read-only root filesystem, dan bounded PID count.


## Reference Routes

Module/example CRUD hanya untuk development/reference. Staging dan production menolak `EXAMPLE_ROUTES_ENABLED=true`.

Jangan membawa route contoh ke service turunan tanpa auth/authorization yang nyata.

## Metrics

Jika metrics diaktifkan, `METRICS_TOKEN` wajib tersedia.

Bearer token metrics adalah application-level control tambahan. Production tetap sebaiknya membatasi `/metrics` ke monitoring/private network.

## Authentication Verifier

Implementasi `verifyToken` milik service harus memvalidasi sesuai jenis credential, misalnya untuk JWT:
- signature
- allowed algorithm
- issuer
- audience
- expiration / not-before
- revocation/session state bila desain memerlukannya

Verifier failure tidak boleh membocorkan detail parser/provider ke client.

## SSRF / Outbound Destination

Base URL provider/internal API harus berasal dari trusted configuration.

Jangan meneruskan URL/hostname dari input user langsung ke `fetchWithPolicy()`.

Jika business flow memang memilih destination berdasarkan input, gunakan explicit allowlist dan blok destination internal/metadata yang tidak sah.
