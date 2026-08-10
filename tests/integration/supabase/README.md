# Supabase integration suite

This suite runs only against the disposable stack managed by Supabase CLI. `run-local.sh`
starts Docker services, performs `supabase db reset --local` (all 49 migrations), runs
catalog/RLS tests, produces frontend/schema parity JSON, and always stops without backup.

## Security model

Fixture creation is administrative and local. Authorization assertions explicitly switch
to PostgreSQL `authenticated`/`anon` and set the JWT claims consumed by `auth.uid()`; no
service-role behavior is used as evidence of authorization. Test users are real rows in
local `auth.users`, with Alpha/Beta memberships for the five behavioral roles under test.
The catalog suite also verifies all nine currently declared enum roles.

Run `npm run test:integration`. Docker and the Supabase CLI are prerequisites. No access
token, database password, production URL, or remote project is accepted by the runner.

## Current scope and deliberate limitations

The first executable layer covers installed-schema RLS configuration on 15 critical
tables, real Alpha/Beta reads across seven resources, inactive/no-membership/anon denial,
task relationship enforcement, 22
private RPC privilege contracts, and eight SECURITY DEFINER/search-path contracts. The
audit-log direct insert is an explicit **known security finding**, not remediated here.

Still pending for follow-up integration layers: complete RPC happy paths for finance,
communication, monitoring, settings, invitations and support; payment and invitation
concurrency; incremental upgrade fixtures; per-role write matrices for every table; and
real GoTrue-issued access tokens over PostgREST (the SQL suite currently uses equivalent
database roles and JWT claims). These gaps are stated rather than represented as covered.

GitHub Actions executes this runner in the separate `integration-supabase` job. Its only
configuration input is the repository's `supabase/config.toml`; the workflow declares no
Supabase secret, project reference, access token, or remote database password.
