# Architecture Decision Records

Gunakan ADR hanya untuk keputusan penting.

Format nama:

`ADR-001-judul-keputusan.md`

Template:

```md
# ADR-XXX - Judul

## Context

## Options

## Decision

## Consequences
```

Contoh keputusan yang layak ADR:
- mengganti PostgreSQL ke MySQL
- memilih ORM/query builder
- memperkenalkan Redis worker
- mengganti Redis worker dengan broker lain
- mengubah komunikasi sync menjadi async
- shared database exception
