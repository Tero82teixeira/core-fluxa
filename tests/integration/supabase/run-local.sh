#!/usr/bin/env bash
set -euo pipefail

cleanup() { supabase stop --no-backup; }
trap cleanup EXIT

supabase start
supabase db reset --local
supabase test db --local
npm run test:integration:parity
