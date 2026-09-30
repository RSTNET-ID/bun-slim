# 19 - Container Runtime Hardening

## Production Image

Build stage tetap memakai Bun.

Runtime image tidak membutuhkan Bun runtime karena aplikasi sudah dikompilasi menjadi standalone binary.

Model:

```text
oven/bun:alpine
  -> install/build/typecheck
  -> compile server + worker

alpine
  -> ca-certificates
  -> tzdata
  -> curl
  -> dumb-init
  -> compiled binaries
```

Ini mengurangi runtime package surface tanpa mengorbankan HTTPS CA bundle, timezone support, health check, atau PID 1 handling.

## Non-Root

Production image menjalankan dedicated `appuser`.

CI memverifikasi runtime UID bukan root.

## Compose Security Baseline

App dan worker menggunakan:

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
read_only: true
tmpfs:
  - /tmp:size=16m,noexec,nosuid,nodev
pids_limit: 256
```

## Read-Only Root Filesystem

Application binary tidak boleh menulis persistent data ke container filesystem.

Gunakan:
- PostgreSQL untuk relational data
- Redis untuk worker state/queue sesuai desain
- object storage untuk file/media
- explicit volume hanya bila benar-benar diperlukan

`/tmp` disediakan sebagai tmpfs kecil untuk library/runtime yang membutuhkan temporary file.

## Linux Capabilities

Baseline menjatuhkan seluruh Linux capability.

Service HTTP pada port non-privileged tidak membutuhkan capability khusus.

Jangan menambahkan capability kembali tanpa documented requirement.

## Process Limit

`pids_limit` mencegah runaway process/fork behavior menghabiskan host process table.

Naikkan hanya berdasarkan kebutuhan terukur.

## CI Validation

CI:
1. validasi Compose
2. build production Docker image
3. pastikan runtime user non-root
4. start container
5. smoke test `/health/live`

Dengan demikian perubahan Dockerfile tidak bergantung pada keyakinan spiritual bahwa YAML dan multi-stage build pasti benar.
