# Supabase integration suite

This suite validates the local database built exclusively from the repository's migrations. It does not connect to a hosted Supabase project.

## Commands

- `npm run test:integration:setup`: start Supabase and reset the local database.
- `npm run test:integration:rls`: run all pgTAP files under `supabase/tests`.
- `npm run test:integration:parity`: compare the generated TypeScript database contract with the support schema.
- `npm run test:integration`: execute the complete flow and stop the local stack, without a backup.

Docker and the Supabase CLI are required. The parity check is intentionally read-only and reports stale generated types; update those types in a separate change.
