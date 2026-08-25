#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Refresh the local Trailbook PostgreSQL database from an AWS/production dump.

Required environment variables:
  TRAILBOOK_SOURCE_DATABASE_URL     Source PostgreSQL connection URL.
  TRAILBOOK_KEEP_USER_EMAIL         The single account retained locally.
  TRAILBOOK_ALLOW_LOCAL_DB_REPLACE  Must be exactly YES.

Optional environment variables:
  TRAILBOOK_LOCAL_DATABASE_URL      Destination URL. Defaults to the local
                                    Docker database on localhost:55432.
  TRAILBOOK_LOCAL_BACKUP_DIR        Existing-local-database backup directory.
  TRAILBOOK_REFRESH_ENV_FILE        Config file path. Defaults to
                                    scripts/.env.local-db-refresh.

Setup once:
  cp scripts/.env.local-db-refresh.example scripts/.env.local-db-refresh
  # Edit scripts/.env.local-db-refresh and add the real values.

Run later:
  ./scripts/refresh-local-db-from-aws.sh

The destination is replaced. The script refuses non-local destination hosts,
backs up the current local database first, and sanitizes the restored copy.
It never copies S3 objects; production waypoint-image metadata is removed.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 0 ]]; then
  usage >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
server_dir="$(cd "$script_dir/.." && pwd)"
refresh_env_file="${TRAILBOOK_REFRESH_ENV_FILE:-$script_dir/.env.local-db-refresh}"

if [[ -f "$refresh_env_file" ]]; then
  set -a
  # This is a private, user-controlled shell environment file. It is ignored
  # by Git and must not contain untrusted shell input.
  # shellcheck disable=SC1090
  source "$refresh_env_file"
  set +a
fi

for command_name in node pg_dump pg_restore psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: $command_name" >&2
    exit 1
  fi
done

source_database_url="${TRAILBOOK_SOURCE_DATABASE_URL:-}"
local_database_url="${TRAILBOOK_LOCAL_DATABASE_URL:-postgresql://trailbook:trailbook@localhost:55432/trailbook}"
keep_user_email="${TRAILBOOK_KEEP_USER_EMAIL:-}"

if [[ -z "$source_database_url" ]]; then
  echo "TRAILBOOK_SOURCE_DATABASE_URL is required." >&2
  exit 1
fi
if [[ -z "$keep_user_email" ]]; then
  echo "TRAILBOOK_KEEP_USER_EMAIL is required; the script will retain only this account." >&2
  exit 1
fi
if [[ "${TRAILBOOK_ALLOW_LOCAL_DB_REPLACE:-}" != "YES" ]]; then
  echo "Refusing to replace the local database." >&2
  echo "Set TRAILBOOK_ALLOW_LOCAL_DB_REPLACE=YES after checking the destination." >&2
  exit 1
fi

# Prisma URLs may contain ?schema=public, which is not a libpq connection option.
export TRAILBOOK_DB_URL_TO_NORMALIZE="$source_database_url"
source_database_url="$({ node <<'NODE'
const url = new URL(process.env.TRAILBOOK_DB_URL_TO_NORMALIZE);
url.searchParams.delete('schema');
process.stdout.write(url.toString());
NODE
} 2>/dev/null)" || {
  echo "TRAILBOOK_SOURCE_DATABASE_URL is not a valid PostgreSQL URL." >&2
  exit 1
}
unset TRAILBOOK_DB_URL_TO_NORMALIZE

export TRAILBOOK_DB_URL_TO_NORMALIZE="$local_database_url"
local_database_details="$({ node <<'NODE'
const url = new URL(process.env.TRAILBOOK_DB_URL_TO_NORMALIZE);
if (!['postgres:', 'postgresql:'].includes(url.protocol)) process.exit(2);
url.searchParams.delete('schema');
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!localHosts.has(url.hostname)) process.exit(3);
process.stdout.write(`${url.toString()}\n${url.hostname}\n${url.port || '5432'}\n${url.pathname.slice(1)}`);
NODE
} 2>/dev/null)" || {
  echo "TRAILBOOK_LOCAL_DATABASE_URL must be a valid PostgreSQL URL on localhost." >&2
  exit 1
}
unset TRAILBOOK_DB_URL_TO_NORMALIZE

local_database_url="$(sed -n '1p' <<<"$local_database_details")"
local_database_host="$(sed -n '2p' <<<"$local_database_details")"
local_database_port="$(sed -n '3p' <<<"$local_database_details")"
local_database_name="$(sed -n '4p' <<<"$local_database_details")"
if [[ "$source_database_url" == "$local_database_url" ]]; then
  echo "Source and destination database URLs must differ." >&2
  exit 1
fi

backup_dir="${TRAILBOOK_LOCAL_BACKUP_DIR:-$server_dir/.local-db-backups}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
local_backup="$backup_dir/trailbook-local-before-refresh-$timestamp.dump"
work_dir="$(mktemp -d)"
source_dump="$work_dir/trailbook-source.dump"
local_database_replaced=false
cleanup() {
  exit_status=$?
  set +e
  if [[ $exit_status -ne 0 && "$local_database_replaced" == "true" && -s "$local_backup" ]]; then
    echo "Refresh failed after replacement; restoring the previous local backup..." >&2
    pg_restore \
      --clean \
      --if-exists \
      --exit-on-error \
      --single-transaction \
      --no-owner \
      --no-privileges \
      --dbname="$local_database_url" \
      "$local_backup" >&2
    if [[ $? -ne 0 ]]; then
      echo "Automatic rollback failed. Restore this backup manually: $local_backup" >&2
    fi
  fi
  rm -rf "$work_dir"
  exit "$exit_status"
}
trap cleanup EXIT

source_user_count="$({ psql \
  --dbname="$source_database_url" \
  --no-psqlrc \
  --tuples-only \
  --no-align \
  --set=ON_ERROR_STOP=1 \
  --set=keep_user_email="$keep_user_email" \
  --command="SELECT count(*) FROM users WHERE lower(email) = lower(:'keep_user_email');"; } | tr -d '[:space:]')"
if [[ "$source_user_count" != "1" ]]; then
  echo "Expected exactly one source user matching TRAILBOOK_KEEP_USER_EMAIL; found $source_user_count." >&2
  exit 1
fi

echo "Destination: $local_database_host:$local_database_port/$local_database_name"
echo "Backing up the current local database to: $local_backup"
pg_dump \
  --dbname="$local_database_url" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$local_backup"
chmod 600 "$local_backup"

echo "Downloading the source database dump..."
pg_dump \
  --dbname="$source_database_url" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$source_dump"

echo "Replacing the local database in one transaction..."
pg_restore \
  --clean \
  --if-exists \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  --dbname="$local_database_url" \
  "$source_dump"
local_database_replaced=true

retained_user_count="$({ psql \
  --dbname="$local_database_url" \
  --no-psqlrc \
  --tuples-only \
  --no-align \
  --set=ON_ERROR_STOP=1 \
  --set=keep_user_email="$keep_user_email" \
  --command="SELECT count(*) FROM users WHERE lower(email) = lower(:'keep_user_email');"; } | tr -d '[:space:]')"

if [[ "$retained_user_count" != "1" ]]; then
  echo "Expected exactly one user matching TRAILBOOK_KEEP_USER_EMAIL; found $retained_user_count." >&2
  echo "The restored local database was not sanitized. Restore the backup above before using it." >&2
  exit 1
fi

echo "Sanitizing the local copy and retaining only: $keep_user_email"
psql \
  --dbname="$local_database_url" \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 \
  --set=keep_user_email="$keep_user_email" <<'SQL'
BEGIN;

DELETE FROM users WHERE lower(email) <> lower(:'keep_user_email');

TRUNCATE TABLE
  refresh_tokens,
  purchase_events,
  apple_purchase_notifications,
  google_purchase_notifications,
  trip_user_shares,
  waypoint_images;

UPDATE users
SET
  apple_app_account_token = gen_random_uuid(),
  local_test_trip_client_id = NULL,
  local_test_trip_used_at = NULL;

UPDATE purchase_access
SET
  provider = 'fake',
  environment = 'local',
  provider_product_id = NULL,
  original_transaction_id = NULL,
  auto_renew_enabled = NULL,
  verified_at = now();

UPDATE trips
SET
  share_token = NULL,
  share_pin_hash = NULL,
  share_enabled = false,
  shared_at = NULL;

COMMIT;
SQL
local_database_replaced=false

summary="$({ psql \
  --dbname="$local_database_url" \
  --no-psqlrc \
  --tuples-only \
  --no-align \
  --field-separator='|' \
  --set=ON_ERROR_STOP=1 \
  --command="SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM trips), (SELECT count(*) FROM purchase_access);"; } | tr -d '[:space:]')"

echo "Local refresh complete (users|trips|purchase_access): $summary"
echo "Production S3 objects were not copied; waypoint image metadata was removed."
