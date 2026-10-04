# 04 - Data Ownership

## Default Database

Database starter pada branch `mysql-v8`: MySQL 8.

Connection config menggunakan `DATABASE_URL` dengan driver yang dikunci ke MySQL:

```env
DB_DRIVER=mysql
DATABASE_URL=mysql://user:password@mysql:3306/service_db
```

Branch `main` tetap menjadi baseline PostgreSQL. Branch ini tidak dirancang sebagai runtime switch antara dua dialect.

## Portability

Database driver tidak boleh tersebar ke business layer.

Target desain:

```text
Service
  |
Repository
  |
Database Client
```

Area yang database-specific dibatasi pada:
- database client/config
- SQL/repository yang dialect-specific
- migration
- index strategy
- integration test database

Handler, service, dan domain contract tidak boleh berubah hanya karena database berubah.

## SQL

Gunakan parameterized query melalui Bun.SQL tagged template.

Hindari dynamic SQL dari user input tanpa allow-list.

## Transaction

Service yang memiliki multi-write invariant harus menentukan transaction boundary secara eksplisit.

Transaction context harus diteruskan konsisten ke semua repository yang ikut dalam transaction.

MySQL DDL dapat melakukan implicit commit. Jangan menyamakan transaction behavior DML dengan migration DDL.

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
