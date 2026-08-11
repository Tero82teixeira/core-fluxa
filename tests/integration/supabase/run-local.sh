#!/usr/bin/env bash
set -euo pipefail
trap 'supabase stop --no-backup' EXIT
supabase start
supabase db reset --local
supabase test db --local
npm run test:integration:parity
