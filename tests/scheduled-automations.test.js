import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260820120000_scheduled_automation_foundation.sql",
  "utf8",
);
const frontendTriggers = readFileSync("src/lib/automations.ts", "utf8");

test("scheduled processor is tenant-derived, idempotent, and private", () => {
  assert.match(migration, /FOREIGN KEY \(automation_rule_id, organization_id\)/);
  assert.match(migration, /FOR UPDATE OF schedule SKIP LOCKED/);
  assert.match(migration, /automation_executions_schedule_cycle_idx/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.process_due_scheduled_automations[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.doesNotMatch(migration, /pg_cron|cron\.schedule|github/i);
});

test("scheduled trigger remains reserved outside the user-facing trigger list", () => {
  const triggerList = frontendTriggers.match(/AUTOMATION_TRIGGERS = \[([\s\S]*?)\] as const/)?.[1];
  assert.ok(triggerList);
  assert.doesNotMatch(triggerList, /scheduled/);
  assert.match(frontendTriggers, /SCHEDULED_AUTOMATION_TRIGGER = "scheduled"/);
});
