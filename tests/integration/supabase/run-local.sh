#!/usr/bin/env bash
set -Eeuo pipefail

# This command deliberately refuses remote credentials. The local service_role is
# used by the Supabase CLI only while resetting/seeding the disposable database;
# authorization assertions run as anon/authenticated in the SQL suite.
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD
export SUPABASE_INTERNAL_IMAGE_REGISTRY="${SUPABASE_INTERNAL_IMAGE_REGISTRY:-}"

command -v supabase >/dev/null || {
  echo "Supabase CLI is required: https://supabase.com/docs/guides/local-development/cli/getting-started" >&2
  exit 127
}
command -v docker >/dev/null || { echo "Docker is required for disposable Supabase local." >&2; exit 127; }

cleanup() { supabase stop --no-backup >/dev/null 2>&1 || true; }
trap cleanup EXIT

started_at=$SECONDS
supabase start
supabase db reset --local

if [[ "${1:-}" != "--setup-only" ]]; then
  supabase test db --local
  node tests/integration/supabase/schema-parity.mjs
fi

echo "Supabase integration elapsed: $((SECONDS - started_at))s"
