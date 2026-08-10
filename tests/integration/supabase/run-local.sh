#!/usr/bin/env bash
set -Eeuo pipefail

cleanup() {
  supabase stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Every command deliberately targets the disposable local stack. Do not add
# --linked or a project reference: integration tests must never reach production.
npm run test:integration:setup
npm run test:integration:rls
npm run test:integration:parity
