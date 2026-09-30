#!/usr/bin/env sh
# scripts/typecheck-staged.sh
#
# Digunakan oleh lint-staged.
# lint-staged meneruskan daftar file yang di-stage sebagai argumen,
# tapi tsc butuh typecheck seluruh project agar cross-file reference tetap valid.
# Script ini mengabaikan argumen file dan menjalankan typecheck project secara menyeluruh.

exec bun run typecheck
