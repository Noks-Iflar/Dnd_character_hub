#!/usr/bin/env bash
# Weekly backup of the Dnd Hub database: one password-protected 7z archive.
# Runs in GitHub Actions (.github/workflows/backup.yml); can be run by hand the same way.
#
# Environment:
#   DB_URL             Postgres connection string. On Supabase: Connect → Session pooler (port 5432),
#                      with the database password inside. Never commit it.
#   BACKUP_PASSPHRASE  Password of the archive (7-Zip, AES-256, file names hidden too).
#   PG_BIN             Optional folder with pg_dump (its major version must be >= the server's).
#   OUT_DIR            Where to put the archive (default: current folder).
set -euo pipefail

: "${DB_URL:?DB_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
pg_dump="${PG_BIN:+$PG_BIN/}pg_dump"
out_dir="${OUT_DIR:-.}"
stamp="$(date -u +%Y-%m-%d)"
archive="$out_dir/dndhub-backup-$stamp.7z"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "pg_dump: $("$pg_dump" --version)"

# 1. Structure of the app's tables, policies and functions, as it is today (the migrations rebuild it too)
"$pg_dump" "$DB_URL" --schema-only --schema=public --no-owner --file "$work/schema.sql"
# 2. Accounts: e-mails and password hashes, so everyone keeps their login and their user id
"$pg_dump" "$DB_URL" --data-only --table=auth.users --table=auth.identities --file "$work/data-auth.sql"
# 3. Everything in the app: characters, snapshots, edits, notes, library, lore, diary, planner, notifications
"$pg_dump" "$DB_URL" --data-only --schema=public --file "$work/data-public.sql"

cat > "$work/README.txt" <<'TXT'
Резервная копия базы Dnd Hub.

schema.sql       — устройство таблиц, правил доступа и функций на день копии
data-auth.sql    — учётные записи (почта, хеш пароля), чтобы все вошли со своими паролями
data-public.sql  — все данные приложения

Восстановление в новый проект Supabase (лучше вместе с Claude):
1. Выполнить по порядку SQL из supabase/migrations/ (0001, 0002, ...).
2. Загрузить данные с выключенными на время триггерами:
   psql "<строка подключения Session pooler>" --single-transaction -v ON_ERROR_STOP=1 \
     --command 'SET session_replication_role = replica' \
     --file data-auth.sql --file data-public.sql
3. Заново создать секреты Vault (project_url, notify_secret) и секреты функций.
TXT

for f in schema.sql data-auth.sql data-public.sql; do
  printf '%-16s %8s KB, tables with data: %s\n' "$f" "$(( $(wc -c < "$work/$f") / 1024 ))" "$(grep -c '^COPY ' "$work/$f" || true)"
done

# -mhe=on hides the file names too; the password goes to 7z only, never to the log
7z a -t7z -mx=9 -mhe=on -p"$BACKUP_PASSPHRASE" "$archive" "$work"/* > /dev/null
7z t -p"$BACKUP_PASSPHRASE" "$archive" > /dev/null
echo "archive: $archive ($(( $(wc -c < "$archive") / 1024 )) KB), test OK"
