# Supabase integration suite

This suite validates the FLUXA database entirely against the local Supabase stack. It never links to, resets, or generates types from a remote project.

## Requirements

- Docker
- Supabase CLI
- Node.js 22

## Run the complete suite

```sh
npm run test:integration
```

The runner starts Supabase, reapplies all migrations with `supabase db reset --local`, runs every pgTAP file under `supabase/tests/database`, checks schema parity, and stops the stack without creating a backup even when a check fails.

Individual stages are also available:

```sh
npm run test:integration:setup
npm run test:integration:rls
npm run test:integration:parity
supabase stop --no-backup
```

Schema parity compares the public table and function names generated from the local database with `src/integrations/supabase/types.ts`. A mismatch is reported but the committed types are never changed automatically.
