import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260826010000_configurable_task_distribution.sql",
  "utf8",
);
const automations = readFileSync("src/lib/automations.ts", "utf8");
const automationPage = readFileSync(
  "src/routes/_authenticated/automacoes.tsx",
  "utf8",
);
const teamHook = readFileSync("src/hooks/use-team.ts", "utf8");
const teamPage = readFileSync("src/routes/_authenticated/equipe.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("distribution is explicitly configured on each eligible team member", () => {
  for (const column of [
    "distribution_sector",
    "distribution_function",
    "automatic_task_capacity",
    "receives_automatic_tasks",
    "last_automatic_task_at",
  ]) {
    assert.match(migration, new RegExp(`ADD COLUMN ${column}`));
    assert.match(types, new RegExp(`${column}:`));
  }
  assert.match(migration, /automatic_task_capacity BETWEEN 1 AND 500/);
  assert.match(migration, /NOT receives_automatic_tasks OR/);
  assert.match(teamHook, /update_member_task_distribution/);
  assert.match(teamPage, /Configurar distribuição/);
  assert.match(teamPage, /Capacidade de tarefas abertas/);
});

test("least-loaded selection is tenant-safe, capacity-aware and deterministic", () => {
  assert.match(migration, /member\.organization_id = _organization_id/);
  assert.match(migration, /member\.is_active/);
  assert.match(migration, /member\.receives_automatic_tasks/);
  assert.match(migration, /member\.role::text <> 'visualizador'/);
  assert.match(migration, /workload\.open_tasks < member\.automatic_task_capacity/);
  assert.match(
    migration,
    /workload\.open_tasks::numeric \/ member\.automatic_task_capacity/,
  );
  assert.match(migration, /member\.last_automatic_task_at NULLS FIRST/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /task\.deleted_at IS NULL/);
  assert.match(migration, /task\.completed_at IS NULL/);
});

test("event and scheduled task executors use the same private selector", () => {
  const calls = migration.match(
    /public\.select_task_distribution_assignee\(/g,
  ) ?? [];
  assert.ok(calls.length >= 5);
  assert.match(migration, /assignee_mode = 'least_loaded'/);
  assert.match(migration, /NO_ELIGIBLE_ASSIGNEE/);
  assert.match(migration, /process_automation_event/);
  assert.match(migration, /process_due_scheduled_automations/);
  assert.match(migration, /send_operational_summary/);
});

test("configuration remains opt-in and existing task modes stay available", () => {
  assert.match(automations, /least_loaded: "Menor carga por setor e função"/);
  for (const mode of [
    "process_owner",
    "fixed_user",
    "rule_creator",
    "unassigned",
  ]) {
    assert.match(automations, new RegExp(mode));
  }
  assert.match(automationPage, /Menor carga por setor e função/);
  assert.match(automationPage, /distribution_sector/);
  assert.match(automationPage, /distribution_function/);
  assert.match(automationPage, /Cadastre os mesmos valores na página Equipe/);
  assert.doesNotMatch(migration, /UPDATE public\.tasks[\s\S]*SET assignee_id/);
});

test("management RPC is public to authenticated users but selector stays private", () => {
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.update_member_task_distribution\([\s\S]*TO authenticated/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.select_task_distribution_assignee\([\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(migration, /public\.automation_can_manage\(target_organization_id\)/);
  assert.match(migration, /member\.task_distribution_updated/);
});

test("documentation explains scope and failure behavior", () => {
  assert.match(docs, /## Distribuição automática de tarefas/);
  assert.match(docs, /não redistribui tarefas já existentes/);
  assert.match(docs, /sem capacidade disponível/);
});
