import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { filterTasks, groupTasksByStatus, isTaskArchived, isTaskOpen, isTaskOverdue, taskDateKey, taskIndicators } from "../src/lib/tasks.ts";

const task = (overrides = {}) => ({ status: "pendente", priority: "media", due_at: "2026-08-01T12:00:00Z", archived_at: null, assignee_name: "Ana", ...overrides });

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
});
