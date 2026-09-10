import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260927120000_commercial_opportunities_member_goals.sql", "utf8");
const hook = readFileSync("src/hooks/use-reports.ts", "utf8");
const panels = readFileSync("src/components/reports/business-panels.tsx", "utf8");

test("commercial opportunities are tenant isolated and written only through guarded RPCs", () => {
  assert.match(migration, /CREATE TABLE public\.commercial_opportunities/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /commercial_opportunities_select[\s\S]+is_org_member/);
  assert.match(migration, /has_org_role[\s\S]+proprietario[\s\S]+operacional/);
  assert.match(migration, /commercial\.opportunity\.created/);
  assert.match(migration, /commercial\.opportunity\.archived/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE[\s\S]+commercial_opportunities FROM authenticated/);
  assert.doesNotMatch(migration, /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:TABLE\s+)?public\.commercial_opportunities/i);
});

test("individual goals are bounded, audited and restricted to managers", () => {
  assert.match(migration, /CREATE TABLE public\.member_performance_goals/);
  assert.match(migration, /completed_tasks_target BETWEEN 0 AND 100000/);
  assert.match(migration, /set_member_performance_goals/);
  assert.match(migration, /performance\.member_goals\.updated/);
  assert.match(migration, /ARRAY\['proprietario','administrador','gestor'\]/);
  assert.doesNotMatch(migration, /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:TABLE\s+)?public\.member_performance_goals/i);
});

test("reports load follow-ups and expose usable funnel and capacity controls", () => {
  assert.match(hook, /communication_threads[\s\S]+follow_up_at/);
  assert.match(hook, /commercial_opportunities/);
  assert.match(hook, /member_performance_goals/);
  for (const text of ["Nova oportunidade", "Motivo da perda", "Previsão ponderada", "Pessoas sobrecarregadas", "Salvar metas individuais"]) assert.ok(panels.includes(text));
});
