#!/usr/bin/env bash
set -Eeuo pipefail

# This command deliberately refuses remote credentials. The local service_role is
# used by the Supabase CLI only while resetting/seeding the disposable database;
# authorization assertions run as anon/authenticated in the SQL suite.
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD

command -v supabase >/dev/null || {
  echo "Supabase CLI is required: https://supabase.com/docs/guides/local-development/cli/getting-started" >&2
  exit 127
}
command -v docker >/dev/null || { echo "Docker is required for disposable Supabase local." >&2; exit 127; }

cleanup() { supabase stop --no-backup >/dev/null 2>&1 || true; }
trap cleanup EXIT

started_at=$SECONDS
migration_count="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
echo "[integration-supabase] migrations discovered: ${migration_count}"
if [[ "$migration_count" != "49" ]]; then
  echo "[integration-supabase] expected exactly 49 versioned migrations" >&2
  exit 1
fi

supabase start
supabase db reset --local
echo "[integration-supabase] migrations applied from zero: ${migration_count}"

if [[ "${1:-}" != "--setup-only" ]]; then
  supabase test db --local
  echo "[integration-supabase] pgTAP assertions passed: 59 (27 RLS/fixtures + 32 RPC/catalog)"
  node tests/integration/supabase/schema-parity.mjs
  echo "[integration-supabase] schema parity: PASS"
fi

echo "Supabase integration elapsed: $((SECONDS - started_at))s"
