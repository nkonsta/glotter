#!/bin/zsh

set -euo pipefail
umask 077

export SUPABASE_TELEMETRY_DISABLED=1

backup_root="${HOME:?}/Backups/glotter"
run_timestamp="$(date '+%Y-%m-%d_%H-%M-%S')"
backup_dir="${backup_root}/${run_timestamp}"

for required_command in supabase docker shasum; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command is not installed: $required_command"
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  echo 'Docker is not running. Start Docker Desktop first.'
  exit 1
fi

supabase --version
supabase db dump --help >/dev/null

read -r -s 'GLOTTER_DB_URL?Paste the Session pooler connection string: '
printf '\n'

if [[ -z "$GLOTTER_DB_URL" ]]; then
  echo 'No connection string provided.'
  exit 1
fi

trap 'unset GLOTTER_DB_URL' EXIT

mkdir -p "$backup_root"

if [[ -e "$backup_dir" ]]; then
  echo "Backup directory already exists: $backup_dir"
  exit 1
fi

mkdir "$backup_dir"

echo 'Creating roles dump...'
supabase db dump \
  --db-url "$GLOTTER_DB_URL" \
  --file "$backup_dir/roles.sql" \
  --role-only

echo 'Creating schema dump...'
supabase db dump \
  --db-url "$GLOTTER_DB_URL" \
  --file "$backup_dir/schema.sql"

echo 'Creating data dump...'
supabase db dump \
  --db-url "$GLOTTER_DB_URL" \
  --file "$backup_dir/data.sql" \
  --use-copy \
  --data-only \
  --exclude 'storage.buckets_vectors' \
  --exclude 'storage.vector_indexes'

test -s "$backup_dir/roles.sql"
test -s "$backup_dir/schema.sql"
test -s "$backup_dir/data.sql"

copy_sections="$(grep -c '^COPY ' "$backup_dir/data.sql" || true)"
copy_terminators="$(grep -Fxc '\.' "$backup_dir/data.sql" || true)"

if (( copy_sections == 0 || copy_sections != copy_terminators )); then
  echo 'Data dump failed its COPY-section integrity check.'
  exit 1
fi

(
  cd "$backup_dir"
  shasum -a 256 roles.sql schema.sql data.sql > SHA256SUMS
  shasum -a 256 -c SHA256SUMS
)

echo
echo "Backup completed successfully with ${copy_sections} data sections:"
echo "$backup_dir"
ls -lh "$backup_dir"
