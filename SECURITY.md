# Security Policy

## Scope

Repository ini adalah starter microservice. Kerentanan pada baseline runtime, middleware, database handling, worker, logging, container, atau CI security checks dianggap security-relevant.

## Reporting

Jangan membuka public issue berisi credential, exploit detail aktif, atau data sensitif.

Gunakan private security reporting/repository security advisory pada GitHub organization bila tersedia, atau jalur security internal organisasi.

## Baseline Requirements

- jangan commit `.env` atau secret nyata
- jangan log authorization header, token, password, API key, DB/Redis URL credential, cookie, atau private key
- dependency production high/critical advisory memblokir CI
- tenant scope membutuhkan authorization
- retry write membutuhkan idempotency strategy
- container production berjalan non-root
- Redis/database tidak diekspos public tanpa kebutuhan dan kontrol eksplisit
- reference/example routes tidak aktif di staging/production
- metrics yang diaktifkan membutuhkan bearer token dan tetap sebaiknya dibatasi jaringan
- provider/outbound URL tidak boleh berasal langsung dari input user tanpa SSRF/origin policy

## Supported Version

Setelah tag v1.0.0 dibuat, security fix diterapkan pada latest supported major release. Patch security yang backward-compatible harus dirilis sebagai patch version.
