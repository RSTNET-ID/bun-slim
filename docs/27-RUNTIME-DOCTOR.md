# 27 - Runtime Doctor

## Purpose

`doctor` adalah preflight command untuk memastikan service dapat start dengan konfigurasi runtime yang masuk akal sebelum traffic diberikan ke process.

Command ini tidak menggantikan health endpoint. Health endpoint mengawasi process yang sudah berjalan; doctor memeriksa deployment sebelum process utama dijalankan.

## Commands

Full runtime check:

```bash
bun run doctor
```

Production standalone binary:

```bash
./doctor
```

Static/offline validation tanpa koneksi database atau Redis:

```bash
bun run doctor:offline
./doctor --offline
```

Machine-readable output:

```bash
./doctor --json
./doctor --offline --json
```

Exit code:
- `0`: semua mandatory check lolos
- `1`: minimal satu runtime/configuration check gagal
- `2`: CLI option tidak valid

## Checks

Doctor memeriksa:

- environment melalui schema yang sama dengan service runtime, termasuk file-backed secrets dan effective `REDIS_NAMESPACE`
- runtime Bun minimal 1.4
- `DB_TLS_CA_FILE` bila dikonfigurasi
- worker registry ketika `WORKER_ENABLED=true`
- scheduler registry dan cron/timezone validation
- konektivitas database dengan `SELECT 1`
- Redis `PING` bila `REDIS_URL` tersedia

Mode `--offline` tetap menjalankan seluruh check statis, tetapi menandai database dan Redis sebagai `skip`.

## Security

Output tidak mencetak:

- `DATABASE_URL`
- `REDIS_URL`
- password
- token
- CA content
- raw connection error

Error environment hanya mencetak nama field yang gagal validasi. Ini sengaja dibuat membosankan karena diagnostic command bukan tempat yang tepat untuk menumpahkan credential ke log CI atau deployment.

## Worker Registry Rule

Jika:

```env
WORKER_ENABLED=true
```

tetapi `src/worker/registry.ts` tidak memiliki handler, doctor gagal.

Worker yang disabled boleh memiliki registry kosong.

## Scheduler Registry Rule

Jika:

```env
SCHEDULER_ENABLED=true
```

tetapi tidak ada task pada `src/scheduler/registry.ts`, doctor gagal.

Jika task tersedia, doctor menjalankan validator scheduler yang sama dengan runtime sehingga duplicate name, cron invalid, dan timezone invalid tertangkap sebelum scheduler process start.

## Redis Check

Redis hanya diperiksa bila `REDIS_URL` tersedia. Doctor memakai dedicated client dengan reconnect dan offline queue dimatikan agar preflight gagal cepat, bukan berubah menjadi proses yang mencoba berdamai dengan Redis selama entah berapa lama.

## Deployment Usage

Contoh pre-start:

```bash
./doctor && exec ./server
```

Untuk worker:

```bash
WORKER_ENABLED=true ./doctor && exec ./worker
```

Untuk scheduler:

```bash
SCHEDULER_ENABLED=true ./doctor && exec ./scheduler
```

Doctor sebaiknya dijalankan sebagai deployment/pre-start check, bukan sebagai liveness probe berulang. Koneksi database dan Redis setiap beberapa detik hanya menghasilkan traffic diagnostik yang tidak perlu.

## Release Rule

Production image wajib membawa `./doctor`. Release check menjaga:

- source doctor tersedia
- package scripts tersedia
- standalone binary ikut build
- Docker runtime image menyalin binary doctor
