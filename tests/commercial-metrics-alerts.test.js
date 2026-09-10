import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260928120000_commercial_metrics_alerts.sql",
  "utf8",
);
const central = readFileSync("src/routes/_authenticated/central.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("commercial stage history is tenant-scoped and browser read-only", () => {
  assert.match(migration, /commercial_opportunity_stage_history[\s\S]*ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /USING \(public\.is_org_member\(organization_id\)\)/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/);
  assert.doesNotMatch(migration, /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:TABLE\s+)?public\.commercial_opportunity_stage_history/i);
  assert.match(migration, /IF old_stage IS DISTINCT FROM _stage/);
  assert.match(migration, /INSERT INTO public\.commercial_opportunity_stage_history/);
});

test("next-action alerts are idempotent, assigned and part of the temporal cycle", () => {
  assert.match(migration, /create_commercial_next_action_notifications/);
  assert.match(migration, /ON CONFLICT \(organization_id, dedupe_key\)/);
  assert.match(migration, /m\.user_id = c\.owner_id/);
  assert.match(migration, /m\.role IN \('proprietario','administrador','gestor'\)/);
  assert.match(migration, /commercial_next_action_notifications_created/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_commercial_next_action_notifications[\s\S]*authenticated, service_role/);
});

test("Central and generated types expose commercial alerts and history", () => {
  assert.match(central, /Próximas ações comerciais/);
  assert.match(central, /Ações comerciais vencidas/);
  assert.match(types, /commercial_opportunity_stage_history:/);
  assert.match(types, /create_commercial_next_action_notifications:/);
});
