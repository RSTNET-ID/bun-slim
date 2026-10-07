# Contributing to Bun Slim

Terima kasih sudah mempertimbangkan kontribusi ke Bun Slim.

Bun Slim adalah starter microservice yang sengaja dijaga kecil, eksplisit, dan production-oriented. Kontribusi terbaik adalah perubahan yang menyelesaikan masalah nyata tanpa menambah abstraction atau dependency yang tidak perlu.

## Branches

- `main`: baseline PostgreSQL.
- `mysql-v8`: baseline MySQL 8.

Perubahan yang bersifat database-agnostic sebaiknya menjaga parity kedua branch. Perubahan persistence harus mengikuti karakteristik database masing-masing dan tidak memaksakan abstraction palsu hanya demi keseragaman.

## Local Setup

```bash
bun install
cp .env.example .env
bun run dev
```

Untuk integration test, siapkan database/Redis sesuai dokumentasi branch yang digunakan.

## Before Opening a Pull Request

Jalankan:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run audit:prod
bun run test
bun run build
bun run release:check
```

Perubahan database juga harus menjalankan integration test yang relevan.

## Engineering Rules

- baca `AGENTS.md` dan `docs/13-CODING-RULES.md`;
- gunakan Bun native API bila sudah memadai;
- jangan menambah ORM, query-builder internal, generic base repository, service container, atau framework baru tanpa kebutuhan production yang konkret;
- semua input eksternal harus divalidasi;
- authentication dan authorization adalah concern terpisah;
- query database harus parameterized;
- jangan log secret, credential, bearer token, cookie, atau data pribadi yang tidak diperlukan;
- network call harus memiliki timeout dan retry hanya jika aman;
- write yang dapat di-retry membutuhkan idempotency strategy;
- collection/query berpotensi besar harus bounded dan deterministic;
- pertahankan backward compatibility kecuali breaking change memang disetujui.

## Database Changes

Migration yang sudah pernah dipakai tidak boleh diedit ulang.

Reference/sample data baru gunakan seeder yang idempotent.

Untuk perubahan schema production, pertimbangkan lock duration, rollback, deployment ordering, dan compatibility antara versi aplikasi lama/baru.

## Security Reports

Jangan membuka public issue untuk credential, exploit aktif, atau vulnerability yang belum ditangani. Ikuti `SECURITY.md`.

## Pull Requests

PR sebaiknya kecil dan fokus. Jelaskan:

- masalah yang diselesaikan;
- pendekatan yang dipilih;
- test/validation yang dijalankan;
- risiko compatibility atau operasional;
- dampak ke `main` dan `mysql-v8` bila relevan.

Maintainer dapat menolak perubahan yang technically valid tetapi memperbesar core tanpa manfaat yang cukup. Starter kecil biasanya mati bukan karena kekurangan abstraction, tetapi karena terlalu banyak orang berhasil menambahkannya.
