import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260823130000_schedule_temporal_automation_job.sql",
  "utf8",
);
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("temporal job is single, idempotent, trusted, and cost-limited", () => {
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_cron/);
  assert.match(migration, /current_user <> 'postgres'/);
  assert.match(migration, /SCHEDULER_REQUIRES_POSTGRES/);
  assert.match(migration, /has_function_privilege\([\s\S]*'postgres'/);
  assert.match(migration, /FOR existing_job IN[\s\S]*cron\.unschedule/);
  assert.match(
    migration,
    /cron\.schedule\([\s\S]*'core-fluxa-process-due-scheduled-automations'/,
  );
  assert.match(migration, /'\*\/15 \* \* \* \*'/);
  assert.match(
    migration,
    /'SELECT public\.process_due_scheduled_automations\(\);'/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON SCHEMA cron FROM PUBLIC, anon, authenticated/,
  );
});

test("temporal job has no tenant input, remote call, or secret", () => {
  assert.doesNotMatch(migration, /organization_id|service_role_key|anon_key/i);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|edge function|github/i);
  assert.match(docs, /15 minutos/);
  assert.match(docs, /Cloud → Jobs/);
});
