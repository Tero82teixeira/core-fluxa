# Supabase integration tests

This suite rebuilds an isolated **local** Supabase database from every migration,
runs the pgTAP tests, and verifies that every migration on disk is registered in
the local migration history. It never links to or accesses a remote project.

## Run locally

Docker and the Supabase CLI are required.

```sh
npm run test:integration
```

Individual phases are available as `test:integration:setup`,
`test:integration:rls`, and `test:integration:parity`. The full runner always
stops the local stack with `--no-backup`, including after a failure. Do not use
`--linked` in this suite.
