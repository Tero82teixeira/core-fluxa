import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { buildTaskStatusUpdate, filterTasks, groupTasksByStatus, isTaskArchived, isTaskOpen, isTaskOverdue, taskDateKey, taskIndicators } from "../src/lib/tasks.ts";

const task = (overrides = {}) => ({ status: "pendente", priority: "media", due_at: "2026-08-01T12:00:00Z", archived_at: null, assignee_name: "Ana", ...overrides });
const migration = readFileSync(new URL("../supabase/migrations/20260802190000_complete_tasks_module.sql", import.meta.url), "utf8");

describe("módulo de tarefas", () => {
  test("pendente está aberta", () => assert.equal(isTaskOpen("pendente"), true));
  test("em andamento está aberta", () => assert.equal(isTaskOpen("em_andamento"), true));
  test("aguardando está aberta", () => assert.equal(isTaskOpen("aguardando"), true));
  test("concluída está fechada", () => assert.equal(isTaskOpen("concluida"), false));
  test("cancelada está fechada", () => assert.equal(isTaskOpen("cancelada"), false));
  test("identifica archived_at", () => assert.equal(isTaskArchived(task({ archived_at: "2026-08-01" })), true));
  test("identifica status arquivada", () => assert.equal(isTaskArchived(task({ status: "arquivada" })), true));
  test("não arquivada permanece ativa", () => assert.equal(isTaskArchived(task()), false));
  test("identifica atraso", () => assert.equal(isTaskOverdue(task(), new Date("2026-08-02")), true));
  test("não marca tarefa concluída como atrasada", () => assert.equal(isTaskOverdue(task({ status: "concluida" }), new Date("2026-08-02")), false));
  test("não marca tarefa sem prazo como atrasada", () => assert.equal(isTaskOverdue(task({ due_at: null }), new Date("2026-08-02")), false));
  test("extrai dia UTC da agenda", () => assert.equal(taskDateKey("2026-08-02T22:10:00Z"), "2026-08-02"));
  test("prazo ausente não tem dia", () => assert.equal(taskDateKey(null), null));
  test("prazo inválido não tem dia", () => assert.equal(taskDateKey("inválido"), null));
  test("filtra abertas", () => assert.equal(filterTasks([task(), task({ status: "concluida" })], { status: "open" }).length, 1));
  test("filtra prioridade", () => assert.equal(filterTasks([task(), task({ priority: "alta" })], { priority: "alta" })[0].priority, "alta"));
  test("filtra responsável", () => assert.equal(filterTasks([task(), task({ assignee_name: "Bia" })], { assignee: "Bia" }).length, 1));
  test("filtra arquivadas", () => assert.equal(filterTasks([task(), task({ archived_at: "2026-08-01" })], { archived: true }).length, 1));
  test("calcula indicadores", () => assert.deepEqual(taskIndicators([task(), task({ status: "concluida" }), task({ status: "arquivada" })], new Date("2026-08-02")), { open: 1, overdue: 1, completed: 1, archived: 1 }));
  test("agrupa colunas do quadro", () => assert.equal(groupTasksByStatus([task(), task({ status: "aguardando" })]).aguardando.length, 1));
  test("inclui em andamento no payload de atualização", () => assert.equal(buildTaskStatusUpdate("em_andamento", "user-1").status, "em_andamento"));
  test("inclui aguardando no payload de atualização", () => assert.equal(buildTaskStatusUpdate("aguardando", "user-1").status, "aguardando"));
  test("conclusão registra autor e instante", () => assert.deepEqual(buildTaskStatusUpdate("concluida", "user-1", "2026-08-16T12:00:00.000Z"), {
    status: "concluida",
    completed_at: "2026-08-16T12:00:00.000Z",
    completed_by: "user-1",
  }));
  test("reabertura limpa os campos de conclusão", () => assert.deepEqual(buildTaskStatusUpdate("pendente", "user-1"), {
    status: "pendente",
    completed_at: null,
    completed_by: null,
  }));
  test("edição legada sem status preserva o status atual", () => assert.deepEqual(buildTaskStatusUpdate(undefined, "user-1"), {}));
});

describe("segurança SQL de tarefas", () => {
  test("bloqueia responsável de outra organização", () => assert.match(migration, /organization_members[\s\S]+m\.organization_id = NEW\.organization_id[\s\S]+TASK_ASSIGNEE_NOT_MEMBER/));
  test("bloqueia cliente de outra organização", () => assert.match(migration, /clients c[\s\S]+c\.organization_id = NEW\.organization_id[\s\S]+TASK_CLIENT_ORG_MISMATCH/));
  test("bloqueia processo de outra organização", () => assert.match(migration, /processes p[\s\S]+p\.organization_id = NEW\.organization_id[\s\S]+TASK_PROCESS_ORG_MISMATCH/));
  test("bloqueia documento de outra organização", () => assert.match(migration, /documents d[\s\S]+d\.organization_id = NEW\.organization_id[\s\S]+TASK_DOCUMENT_ORG_MISMATCH/));
  test("bloqueia monitoramento de outra organização", () => assert.match(migration, /monitoring_items m[\s\S]+m\.organization_id = NEW\.organization_id[\s\S]+TASK_MONITORING_ORG_MISMATCH/));
  test("organization_id da tarefa é imutável", () => assert.match(migration, /OLD\.organization_id <> NEW\.organization_id[\s\S]+TASK_ORGANIZATION_IMMUTABLE/));
  test("comentário não pode ser movido de organização", () => assert.match(migration, /task_comments_enforce_scope_trg BEFORE INSERT OR UPDATE/));
  test("exclusão física está bloqueada", () => { assert.match(migration, /REVOKE DELETE ON public\.tasks FROM authenticated/); assert.doesNotMatch(migration, /CREATE POLICY tasks_delete/); });
  test("arquivamento lógico permanece disponível", () => assert.match(migration, /ADD COLUMN IF NOT EXISTS archived_at[\s\S]+ADD COLUMN IF NOT EXISTS deleted_at/));
});
