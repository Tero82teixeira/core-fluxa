# Supabase integration tests

This suite boots a disposable local Supabase stack, resets its database, applies
every migration, runs pgTAP security tests, validates essential schema objects,
and shuts the stack down without a backup.

## Requirements

- Docker
- Supabase CLI
- Node.js and the project dependencies
- `psql` (installed by the Supabase CLI setup in CI)

Run the complete suite with:

```sh
npm run test:integration
```

Individual stages are available as `test:integration:setup`,
`test:integration:rls`, and `test:integration:parity`. The scripts only use
`supabase db reset --local` and the local database port (`54322` by default).
They must not be changed to use `--linked`, `db push`, or remote credentials.

The runner always executes `supabase stop --no-backup`, including after a
failure. A migration or pgTAP error is intentionally propagated unchanged so
CI cannot hide a real database failure.
