# 28 - File-Backed Secrets

## Goal

Production deployment dapat memberikan secret melalui mounted file tanpa bergantung pada automatic dotenv loading.

Supported pairs:

```text
DATABASE_URL              <-> DATABASE_URL_FILE
MIGRATION_DATABASE_URL    <-> MIGRATION_DATABASE_URL_FILE
REDIS_URL                 <-> REDIS_URL_FILE
METRICS_TOKEN             <-> METRICS_TOKEN_FILE
```

## Resolution Rules

Untuk setiap pair:

1. direct value saja: gunakan direct value
2. file variable saja: baca isi file saat startup
3. keduanya di-set: startup gagal
4. file kosong: startup gagal
5. file tidak dapat dibaca: startup gagal tanpa mencetak path atau isi secret

Trailing newline pada mounted secret file di-trim.

## Deployment Boundary

Application runtime cukup menerima application database credential.

Migration job dapat menerima credential DDL terpisah melalui `MIGRATION_DATABASE_URL_FILE`.

Jangan memberikan migration credential ke app, worker, atau scheduler bila mereka tidak membutuhkannya.

Redis dan metrics token juga dapat berasal dari secret mount masing-masing.

## Docker / Orchestrator Pattern

Mount secret sebagai read-only file lalu set hanya variable `*_FILE` yang sesuai.

Contoh logical layout:

```text
/run/secrets/database-url
/run/secrets/migration-database-url
/run/secrets/redis-url
/run/secrets/metrics-token
```

Folder local `secrets/` di-ignore oleh Git dan Docker build context. Secret production sebaiknya berasal dari Docker secrets, Kubernetes Secrets/CSI, Vault agent, cloud secret manager mount, atau mekanisme platform setara.

## Do Not

- jangan commit file secret
- jangan copy secret ke Docker image
- jangan set direct value dan `*_FILE` bersamaan
- jangan log isi secret
- jangan memberikan migration credential DDL ke application runtime
- jangan menganggap file mount menggantikan database grants atau network policy

## Runtime Interaction

Compiled production binaries tetap menggunakan:

```text
--no-compile-autoload-dotenv
--no-compile-autoload-bunfig
```

File-backed secret resolution adalah explicit application configuration, bukan automatic config discovery.
