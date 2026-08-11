# Supabase integration suite

This suite reconstructs a disposable **local** Supabase database from every
repository migration, runs the pgTAP security tests, and compares the schema
surface used by the frontend with the migrations and generated database types.
It does not connect to the linked project or any remote backend.

## Commands

- `npm run test:integration:setup` starts Supabase and runs a clean local reset.
- `npm run test:integration:rls` runs all SQL files in `supabase/tests`.
- `npm run test:integration:parity` performs the static schema parity check.
- `npm run test:integration` runs the complete sequence and always stops the
  local stack with `supabase stop --no-backup`.

The GitHub Actions job `integration-supabase` deliberately keeps reset, pgTAP,
and parity as separate steps. A migration failure therefore remains visible at
the exact failing reset step and is never converted into a passing result.

When a clean reset fails, record the failing migration, SQLSTATE, complete
PostgreSQL message, involved object, and the preceding successful migration.
Do not edit production migrations as part of a validation-only pull request.
