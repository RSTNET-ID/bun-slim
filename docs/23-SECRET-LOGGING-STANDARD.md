# 23 - Secret and Logging Standard

## Goal

Secret tidak boleh bocor melalui source control, structured logs, error responses, metrics, atau example configuration.

## Structured Log Redaction

Logger baseline melakukan recursive redaction sebelum JSON serialization.

Key sensitif meliputi pola seperti:
- authorization
- proxy-authorization
- cookie / set-cookie
- password / passwd / pwd
- secret
- token
- api-key / api_key / apikey
- access-key
- private-key
- client-secret
- database-url
- redis-url

camelCase juga dinormalisasi, sehingga `clientSecret` dan `databaseUrl` ikut terlindungi.

Credential yang tertanam pada URL juga disamarkan:

```text
postgres://user:password@db:5432/app
```

menjadi:

```text
postgres://[REDACTED]@db:5432/app
```

## Redaction Is a Safety Net

Redaction bukan izin untuk sengaja mengirim secret ke logger.

Kode tetap harus menghindari:

```ts
logger.info('provider config', providerConfig);
logger.error('request failed', { authorization });
```

Gunakan field aman dan minimum yang dibutuhkan untuk diagnosis.

## Environment

- `.env` tidak boleh dicommit
- `.env.example` hanya berisi placeholder/non-secret value
- production secret berasal dari deployment secret management
- jangan mencetak seluruh `process.env`
- startup validation boleh menyebut nama variable yang salah, bukan nilainya

## Error Handling

Client-facing error tidak boleh berisi:
- stack trace
- DB/Redis URL
- provider URL dengan credential/query sensitif
- token/API key
- internal filesystem path yang tidak diperlukan

Unhandled exception detail hanya masuk internal log dan tetap melewati redaction.

## Metrics

Secret dan identifier sensitif tidak boleh menjadi metric label.

Metrics baseline memakai label bounded seperti method, status class, dan logical dependency name.

## Release Gate

`bun run release:check` memeriksa baseline repository dan pola secret tertentu di `.env.example`.

Checker tersebut bukan secret scanner lengkap. Repository/organization tetap boleh menambahkan secret scanning platform-native tanpa mengubah core runtime.
