# Supabase integration tests

This suite validates the complete migration history against a disposable local
Supabase stack. It never reads credentials for, links to, or contacts a hosted
project.

## Run locally

Docker and the Supabase CLI are required. Run `npm run test:integration` to
start Supabase, reset the database, execute every pgTAP file under
`supabase/tests`, compare the generated local schema with the checked-in
TypeScript types, and stop the stack without retaining a backup.

The parity check has a narrow allowlist for the known support-center drift:
`support_requests`, `archive_support_request`, `assign_support_request`,
`create_support_request`, and `update_support_request_status`. Any additional
table or RPC difference fails the check. Regenerating types is intentionally
outside this validation change.
