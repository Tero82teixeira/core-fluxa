import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { businessAgenda, clientLossRisk, commercialFunnel, commercialPerformance, currentMonthPerformance, memberCapacityPerformance } from "../src/lib/reports.ts";

const route = readFileSync("src/routes/_authenticated/relatorios.tsx", "utf8");
const hook = readFileSync("src/hooks/use-reports.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260926130000_performance_goals.sql", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("commercial funnel reports only registered opportunities and values", () => {
  const rows = commercialFunnel([
    { id: "a", stage: "first_contact", estimated_value: 1000 },
    { id: "b", stage: "proposal", estimated_value: 2500 },
    { id: "c", stage: "won", estimated_value: 4000 },
    { id: "d", stage: "lost", estimated_value: 500, archived_at: "2026-01-01" },
  ]);
  assert.deepEqual(rows.map(({ key, value, estimatedValue }) => [key, value, estimatedValue]), [
    ["first_contact", 1, 1000], ["qualification", 0, 0], ["proposal", 1, 2500],
    ["negotiation", 0, 0], ["won", 1, 4000], ["lost", 0, 0],
  ]);
});

test("commercial performance uses closed deals and auditable stage durations", () => {
  const metrics = commercialPerformance(
    [
      { id: "won", stage: "won", estimated_value: 2000, won_at: "2026-09-08T00:00:00Z" },
      { id: "lost", stage: "lost", estimated_value: 500, lost_at: "2026-09-09T00:00:00Z", lost_reason: "Preço" },
      { id: "open", stage: "proposal", estimated_value: 1000 },
    ],
    [
      { opportunity_id: "won", to_stage: "first_contact", changed_at: "2026-09-01T00:00:00Z" },
      { opportunity_id: "won", to_stage: "proposal", changed_at: "2026-09-03T00:00:00Z" },
      { opportunity_id: "won", to_stage: "won", changed_at: "2026-09-08T00:00:00Z" },
      { opportunity_id: "lost", to_stage: "first_contact", changed_at: "2026-09-02T00:00:00Z" },
      { opportunity_id: "lost", to_stage: "lost", changed_at: "2026-09-09T00:00:00Z" },
    ],
    undefined,
    new Date("2026-09-10T00:00:00Z"),
  );
  assert.deepEqual(
    { won: metrics.won, lost: metrics.lost, closed: metrics.closed, winRate: metrics.winRate, averageWonTicket: metrics.averageWonTicket },
    { won: 1, lost: 1, closed: 2, winRate: 50, averageWonTicket: 2000 },
  );
  assert.deepEqual(metrics.lostReasons, [{ reason: "Preço", count: 1 }]);
  assert.equal(metrics.stageDurations.find((row) => row.stage === "proposal").averageDays, 5);
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
    communications: [{ id: "c", subject: "Retornar cliente", status: "aguardando_equipe", follow_up_at: "2026-09-11", assigned_name: "Ana" }],
  }, 30, new Date("2026-09-10T12:00:00Z"));
  assert.deepEqual(rows.map(({ kind, timing }) => [kind, timing]), [
    ["task", "overdue"], ["process", "today"], ["communication", "upcoming"], ["document", "upcoming"],
  ]);
});

test("team capacity flags overload and measures individual monthly results", () => {
  const rows = memberCapacityPerformance(
    [{ user_id: "u1", full_name: "Ana", role: "operacional", is_active: true, automatic_task_capacity: 1, portal_communication_capacity: 2 }],
    [{ id: "t1", assignee_id: "u1", status: "pendente", due_at: "2026-09-01" }, { id: "t2", assignee_id: "u1", status: "concluida", completed_at: "2026-09-03" }],
    [{ id: "p1", owner_id: "u1", stage: "finalizado" }],
    [{ id: "c1", assigned_to: "u1", status: "aberta" }, { id: "c2", assigned_to: "u1", status: "aguardando_equipe" }, { id: "c3", assigned_to: "u1", status: "aberta" }],
    [{ user_id: "u1", goal_month: "2026-09-01", completed_tasks_target: 5, completed_processes_target: 2 }],
    [{ process_id: "p1", to_stage: "finalizado", created_at: "2026-09-04" }],
    new Date("2026-09-10T12:00:00Z"),
  );
  assert.equal(rows[0].overloaded, true);
  assert.deepEqual([rows[0].openTasks, rows[0].openCommunications, rows[0].completedTasks, rows[0].completedProcesses], [1, 3, 1, 1]);
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
  assert.match(types, /commercial_opportunities:/);
  assert.match(types, /member_performance_goals:/);
});
