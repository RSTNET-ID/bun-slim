# AGENTS.md

Repository ini mengikuti Bun + Hono Microservice Standard.

Sebelum mengubah kode:
1. Baca `docs/00-PROJECT.md`.
2. Baca `docs/01-ARCHITECTURE.md`.
3. Baca `docs/02-DESIGN.md`.
4. Baca dokumen yang berkaitan dengan task.
5. Inspeksi implementasi existing sebelum mengubah struktur.
6. Pertahankan API/data contract kecuali perubahan breaking memang diminta.
7. Jangan menambahkan dependency/infrastruktur tanpa kebutuhan konkret.
8. Hono hanya boleh berada di HTTP boundary.
9. Business logic tidak boleh menerima `Hono Context`.
10. PostgreSQL adalah database default, tetapi persistence layer tidak boleh mengunci domain/service ke PostgreSQL.
11. Worker, bila diperlukan, menggunakan Redis sebagai backend queue/job.
12. Service tanpa worker tidak wajib memakai Redis.
13. Tambah atau update test untuk perubahan behavior.
14. Update dokumentasi terkait architecture, API, data, security, observability, atau deployment.
15. Perubahan architecture penting harus memiliki ADR.

Dependency direction default:

`route -> handler -> service -> repository/adapter`

Dilarang membuat dependency balik dari repository/domain ke Hono/HTTP.
