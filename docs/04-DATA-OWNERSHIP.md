# 04 - Data Ownership

## Default Database

Database starter: PostgreSQL.

Connection config default menggunakan satu `DATABASE_URL` atau parameter terstruktur equivalent.

Contoh:

```env
DB_DRIVER=postgres
DATABASE_URL=postgres://user:password@postgres:5432/service_db
```

## Portability

Database driver tidak boleh tersebar ke seluruh business layer.

Target desain:

```text
Service
  |
Repository
  |
Database Client
```

Saat migrasi PostgreSQL -> MySQL, area perubahan idealnya terbatas pada:
- database client
- SQL/repository yang dialect-specific
- migration
- test integration database
- config

Bukan pada handler/service/domain secara keseluruhan.

## SQL

Gunakan parameterized query.

Hindari dynamic SQL dari user input tanpa allow-list.

## Transaction

Service yang memiliki multi-write invariant harus menentukan transaction boundary secara eksplisit.

Transaction context harus diteruskan konsisten ke semua repository yang ikut dalam transaction.

## Index

Index dibuat berdasarkan access pattern nyata:
- lookup keys
- filtering
- ordering
- uniqueness
- idempotency

## Ownership

Setiap service harus mendokumentasikan tabel/schema yang dimilikinya.

Service lain tidak boleh membaca tabel internal secara langsung tanpa keputusan architecture yang terdokumentasi.
