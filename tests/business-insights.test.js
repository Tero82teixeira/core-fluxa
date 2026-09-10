import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { businessAgenda, clientLossRisk, commercialFunnel, currentMonthPerformance } from "../src/lib/reports.ts";

const route = readFileSync("src/routes/_authenticated/relatorios.tsx", "utf8");
const hook = readFileSync("src/hooks/use-reports.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260926130000_performance_goals.sql", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("commercial funnel reports only real client and process states", () => {
  const rows = commercialFunnel(
    [
      { id: "lead", status: "lead" },
      { id: "active", status: "ativo" },
      { id: "won", status: "ativo" },
      { id: "archived", status: "lead", archived_at: "2026-01-01" },
    ],
    [
      { id: "p1", client_id: "active", stage: "em_analise" },
      { id: "p2", client_id: "won", stage: "finalizado" },
      { id: "p3", client_id: "lead", stage: "cancelado" },
    ],
  );
  assert.deepEqual(rows.map(({ key, value }) => [key, value]), [
    ["leads", 1], ["registration", 0], ["active", 2], ["with_process", 2], ["won", 1],
  ]);
});

test("loss risk is explainable and prioritizes combined operational signals", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const rows = clientLossRisk(
    [{ id: "c1", name: "Cliente crítico", status: "com_pendencia", created_at: "2026-01-01", last_interaction_at: "2026-06-01" }],
    [{ id: "t1", client_id: "c1", status: "pendente", due_at: "2026-09-01" }],
    [{ id: "p1", client_id: "c1", stage: "em_analise", due_date: "2026-09-05", last_movement_at: "2026-07-01" }],
    now,
  );
  assert.equal(rows[0].score, 100);
  assert.equal(rows[0].level, "high");
  assert.deepEqual(rows[0].reasons, ["cliente com pendência", "sem interação há 101 dias", "1 tarefa(s) atrasada(s)", "1 processo(s) atrasado(s)", "1 processo(s) sem movimentação"]);
});

test("general agenda merges deadlines without changing their source", () => {
  const rows = businessAgenda({
    tasks: [{ id: "t", title: "Tarefa", status: "pendente", due_at: "2026-09-09" }],
    processes: [{ id: "p", code: "P-1", stage: "em_analise", due_date: "2026-09-10" }],
    documents: [{ id: "d", title: "Documento", status: "pendente", expiration_date: "2026-09-20" }],
    monitoring: [{ source_id: "m", title: "Alvará", monitoring_status: "em_analise", relevant_at: "2026-11-20" }],
  }, 30, new Date("2026-09-10T12:00:00Z"));
  assert.deepEqual(rows.map(({ kind, timing }) => [kind, timing]), [
    ["task", "overdue"], ["process", "today"], ["document", "upcoming"],
  ]);
});

test("monthly performance uses completion dates and never counts leads as clients", () => {
  const actual = currentMonthPerformance(
    [{ status: "lead", created_at: "2026-09-01" }, { status: "ativo", created_at: "2026-09-02" }],
    [{ status: "concluida", completed_at: "2026-09-03" }, { status: "concluida", completed_at: "2026-08-31" }],
    [{ id: "p1", stage: "finalizado" }, { id: "p2", stage: "em_analise" }],
    [{ process_id: "p1", to_stage: "finalizado", created_at: "2026-09-04" }, { process_id: "p2", to_stage: "em_analise", created_at: "2026-09-05" }],
    new Date("2026-09-10T12:00:00Z"),
  );
  assert.deepEqual(actual, { newClients: 1, completedTasks: 1, completedProcesses: 1 });
});

test("reports expose the four business views and guarded monthly goals", () => {
  for (const label of ["Funil comercial", "Risco de perda", "Agenda geral", "Metas e desempenho"]) {
    assert.ok(route.includes(label), `missing ${label}`);
  }
  assert.match(hook, /last_interaction_at/);
  assert.match(hook, /due_date,last_movement_at,value,financial_status,updated_at/);
  assert.match(hook, /process_movements/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /has_org_role/);
  assert.match(migration, /performance\.goals\.updated/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE/);
  assert.doesNotMatch(migration, /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:TABLE\s+)?public\.organization_performance_goals/i);
  assert.match(types, /organization_performance_goals:/);
  assert.match(types, /set_organization_performance_goals:/);
});
