import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildMyDay } from "../src/lib/my-day.ts";

const now = new Date("2030-01-10T12:00:00.000Z");
const task = (overrides = {}) => ({
  id: "task-1",
  organization_id: "org",
  title: "Enviar contrato",
  description: null,
  status: "pendente",
  priority: "media",
  due_at: "2030-01-09T10:00:00.000Z",
  assignee_id: "user-1",
  assignee_name: "Ana",
  completed_at: null,
  client_id: null,
  process_id: null,
  deleted_at: null,
  ...overrides,
});
const communication = (overrides = {}) => ({
  id: "thread-1",
  organization_id: "org",
  client_id: "client",
  subject: "Retornar cliente",
  channel: "interno",
  status: "aguardando_equipe",
  priority: "normal",
  assigned_to: "user-1",
  process_id: null,
  task_id: null,
  follow_up_at: "2030-01-10T15:00:00.000Z",
  created_by: "user-1",
  created_at: "2030-01-01T10:00:00.000Z",
  updated_at: "2030-01-10T10:00:00.000Z",
  archived_at: null,
  clients: { id: "client", name: "Cliente Teste" },
  processes: null,
  tasks: null,
  ...overrides,
});
const portal = (overrides = {}) => ({
  item_kind: "communication",
  item_id: "portal-1",
  client_id: "client",
  client_name: "Cliente Portal",
  title: "Ajuda no portal",
  status: "aguardando_equipe",
  priority: "normal",
  assigned_to: null,
  due_date: null,
  last_activity_at: "2030-01-10T10:00:00.000Z",
  unread_count: 1,
  opened_by_client: true,
  process_code: null,
  submitted_file_name: null,
  requires_action: true,
  ...overrides,
});

test("Meu Dia mostra somente tarefas e atendimentos atribuídos ao usuário", () => {
  const result = buildMyDay({
    tasks: [task(), task({ id: "other", assignee_id: "user-2" })],
    communications: [communication(), communication({ id: "other-thread", assigned_to: "user-2" })],
    portalItems: [],
    userId: "user-1",
    canReviewDocuments: false,
    now,
  });
  assert.equal(result.summary.assignedTasks, 1);
  assert.equal(result.summary.assignedCommunications, 1);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["task:task-1", "communication:thread-1"],
  );
});

test("Meu Dia coloca atrasos e risco de SLA antes da fila normal", () => {
  const result = buildMyDay({
    tasks: [task()],
    communications: [],
    portalItems: [
      portal({
        item_id: "risk",
        priority: "urgente",
        last_activity_at: "2030-01-10T10:20:00.000Z",
      }),
      portal({ item_id: "normal", last_activity_at: "2030-01-10T11:50:00.000Z" }),
    ],
    userId: "user-1",
    canReviewDocuments: false,
    now,
  });
  assert.equal(result.items[0].id, "task:task-1");
  assert.equal(result.items[1].id, "triage:risk");
  assert.equal(result.summary.triage, 2);
});

test("documentos enviados aparecem apenas para quem pode analisar", () => {
  const document = portal({ item_kind: "document_request", item_id: "doc", status: "submitted" });
  const hidden = buildMyDay({
    tasks: [],
    communications: [],
    portalItems: [document],
    userId: "user-1",
    canReviewDocuments: false,
    now,
  });
  const visible = buildMyDay({
    tasks: [],
    communications: [],
    portalItems: [document],
    userId: "user-1",
    canReviewDocuments: true,
    now,
  });
  assert.equal(hidden.summary.documents, 0);
  assert.equal(visible.summary.documents, 1);
  assert.equal(visible.items[0].kind, "document");
});

test("navegação, rota e entrada padrão expõem o painel Meu Dia", async () => {
  const [navigation, route, layout, sidebar] = await Promise.all([
    readFile(new URL("../src/lib/navigation.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/_authenticated/meu-dia.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/_authenticated.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/layout/app-sidebar.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(navigation, /to:\s*"\/meu-dia",[\s\S]*?label:\s*"Meu Dia"/);
  assert.match(route, /Fila de prioridades/);
  assert.match(route, /Comece pelo que exige sua atenção agora/);
  assert.match(layout, /navigate\(\{ to: "\/meu-dia", replace: true \}\)/);
  assert.match(sidebar, /to="\/meu-dia"/);
});
