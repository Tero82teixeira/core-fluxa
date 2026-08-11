#!/usr/bin/env bash
set -euo pipefail

stop_supabase() {
  supabase stop --no-backup >/dev/null 2>&1 || true
}
trap stop_supabase EXIT

supabase start
supabase db reset --local

if [[ "${1:-all}" == "setup" ]]; then
  exit 0
fi

supabase test db --local
node tests/integration/supabase/schema-parity.mjs
