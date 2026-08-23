import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260823120000_manage_scheduled_automations.sql",
  "utf8",
);
const hooks = readFileSync("src/hooks/use-automations.ts", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const frontendAutomations = readFileSync("src/lib/automations.ts", "utf8");

const dedicatedRpcs = [
  "create_scheduled_automation",
  "update_scheduled_automation",
  "set_scheduled_automation_active",
  "archive_scheduled_automation",
];

test("scheduled management RPCs are atomic, tenant-safe, and private", () => {
  for (const rpc of dedicatedRpcs) {
    const body = migration.match(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${rpc}[\\s\\S]*?\\n\\$\\$;`,
      ),
    )?.[0];
    assert.ok(body, `${rpc} must exist`);
    assert.match(body, /SECURITY DEFINER/);
    assert.match(body, /SET search_path = public/);
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}`));
  }

  assert.match(migration, /public\.automation_can_manage\(_organization_id\)/);
  assert.match(migration, /public\.automation_can_manage\(target_organization_id\)/);
  assert.match(migration, /INSERT INTO public\.automation_rules/);
  assert.match(migration, /INSERT INTO public\.automation_schedules/);
  assert.match(migration, /_next_execution_at IS NULL OR _next_execution_at <= now\(\)/);
  assert.match(migration, /IF NOT FOUND THEN RAISE EXCEPTION 'SCHEDULE_NOT_FOUND'/);
});

test("generic automation RPCs reject scheduled rules", () => {
  for (const rpc of [
    "create_automation_rule",
    "update_automation_rule",
    "set_automation_rule_active",
    "duplicate_automation_rule",
    "archive_automation_rule",
  ]) {
    const body = migration.match(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${rpc}[\\s\\S]*?\\n\\$\\$;`,
      ),
    )?.[0];
    assert.ok(body, `${rpc} must be hardened`);
    assert.match(body, /SCHEDULED_RULE_REQUIRES_DEDICATED_RPC/);
  }
});

test("frontend contracts use dedicated RPCs while the trigger remains hidden", () => {
  for (const rpc of dedicatedRpcs) {
    assert.match(hooks, new RegExp(`useRpcMutation\\("${rpc}"`));
    assert.match(types, new RegExp(`${rpc}: \\{`));
  }
  assert.doesNotMatch(hooks, /\.from\("automation_schedules"\)\s*\.(insert|update|delete)/);
  assert.match(frontendAutomations, /SCHEDULED_AUTOMATION_ACTIONS/);
  const triggerList = frontendAutomations.match(
    /AUTOMATION_TRIGGERS = \[([\s\S]*?)\] as const/,
  )?.[1];
  assert.ok(triggerList);
  assert.doesNotMatch(triggerList, /scheduled/);
});
