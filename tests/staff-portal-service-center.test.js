import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  filterPortalServiceCenter,
  formatServiceDuration,
  portalServiceSla,
  prioritizePortalServiceCenter,
  summarizePortalServiceCenter,
} from "../src/lib/portal-service-center.ts";

const migration = readFileSync(
  "supabase/migrations/20260910120000_staff_client_portal_service_center.sql",
  "utf8",
);
const databaseTest = readFileSync(
  "supabase/tests/database/069_staff_client_portal_service_center.sql",
  "utf8",
);
const component = readFileSync(
  "src/components/communication/portal-service-center.tsx",
  "utf8",
);
const route = readFileSync("src/routes/_authenticated/comunicacao.tsx", "utf8");
const clientRoute = readFileSync("src/routes/_authenticated/clientes.$clientId.tsx", "utf8");
const realtime = readFileSync("src/hooks/use-portal-chat.ts", "utf8");
const inboxHook = readFileSync("src/hooks/use-staff-portal-inbox.ts", "utf8");
const communicationHook = readFileSync("src/hooks/use-communication.ts", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

const base = {
  item_id: "item-1",
  client_id: "client-1",
  client_name: "Cliente Um",
  title: "Atendimento",
  priority: "normal",
  assigned_to: null,
  due_date: null,
  last_activity_at: "2026-09-06T12:00:00Z",
  unread_count: 0,
  opened_by_client: false,
  process_code: null,
  submitted_file_name: null,
  requires_action: false,
};

const filters = {
  search: "",
  kind: "all",
  queue: "all",
  status: "all",
  priority: "all",
  assignee: "all",
};

describe("Central de Atendimento do Portal", () => {
  test("resume mensagens, documentos para análise e vencimentos", () => {
    const summary = summarizePortalServiceCenter([
      { ...base, item_kind: "communication", status: "aguardando_equipe", unread_count: 2, requires_action: true },
      { ...base, item_id: "item-2", item_kind: "document_request", status: "submitted", requires_action: true },
      { ...base, item_id: "item-3", item_kind: "document_request", status: "pending", due_date: "2026-09-05" },
    ], "2026-09-06");
    assert.deepEqual(summary, { waitingTeam: 1, unread: 2, submitted: 1, overdue: 1, slaAtRisk: 0, slaOverdue: 0 });
  });

  test("calcula SLA por prioridade somente enquanto a empresa deve responder", () => {
    const now = new Date("2026-09-06T12:00:00Z");
    const urgent = { ...base, item_kind: "communication", status: "aguardando_equipe", priority: "urgente", last_activity_at: "2026-09-06T10:15:00Z" };
    assert.equal(portalServiceSla(urgent, now).state, "at_risk");
    assert.equal(portalServiceSla({ ...urgent, last_activity_at: "2026-09-06T09:00:00Z" }, now).state, "overdue");
    assert.equal(portalServiceSla({ ...urgent, status: "aguardando_cliente" }, now).state, "not_applicable");
    assert.equal(portalServiceSla({ ...urgent, item_kind: "document_request" }, now).state, "not_applicable");
  });

  test("formata espera, filtra alertas e prioriza SLA vencido", () => {
    const now = new Date("2026-09-06T12:00:00Z");
    const overdue = { ...base, item_id: "overdue", item_kind: "communication", status: "aguardando_equipe", priority: "urgente", last_activity_at: "2026-09-06T09:00:00Z", requires_action: true };
    const risk = { ...overdue, item_id: "risk", last_activity_at: "2026-09-06T10:15:00Z" };
    assert.equal(formatServiceDuration(90), "1h 30min");
    assert.equal(filterPortalServiceCenter([risk, overdue], { ...filters, queue: "sla_at_risk" }, null, "2026-09-06", now).length, 1);
    assert.equal(filterPortalServiceCenter([risk, overdue], { ...filters, queue: "sla_overdue" }, null, "2026-09-06", now).length, 1);
    assert.deepEqual(prioritizePortalServiceCenter([risk, overdue], now).map((item) => item.item_id), ["overdue", "risk"]);
  });

  test("filtra busca, fila, situação, prioridade e responsável", () => {
    const items = [
      { ...base, item_kind: "communication", status: "aguardando_equipe", assigned_to: "user-1", priority: "urgente", unread_count: 1, requires_action: true },
      { ...base, item_id: "item-2", client_name: "Cliente Dois", item_kind: "document_request", status: "pending", due_date: "2026-09-05" },
    ];
    assert.equal(filterPortalServiceCenter(items, { ...filters, search: "cliente dois" }, "user-1", "2026-09-06").length, 1);
    assert.equal(filterPortalServiceCenter(items, { ...filters, queue: "unread" }, "user-1", "2026-09-06").length, 1);
    assert.equal(filterPortalServiceCenter(items, { ...filters, queue: "overdue" }, "user-1", "2026-09-06").length, 1);
    assert.equal(filterPortalServiceCenter(items, { ...filters, status: "pending" }, "user-1", "2026-09-06").length, 1);
    assert.equal(filterPortalServiceCenter(items, { ...filters, priority: "urgente" }, "user-1", "2026-09-06").length, 1);
    assert.equal(filterPortalServiceCenter(items, { ...filters, assignee: "mine" }, "user-1", "2026-09-06").length, 1);
    assert.equal(filterPortalServiceCenter(items, { ...filters, assignee: "unassigned" }, "user-1", "2026-09-06").length, 0);
  });

  test("banco separa conversas da revisão documental por papel", () => {
    assert.match(migration, /communication_assert_role\(_organization_id, false\)/);
    assert.match(migration, /ARRAY\['proprietario','administrador'\]/);
    assert.match(migration, /WHERE v_can_review_documents/);
    assert.match(migration, /share\.is_shared/);
    assert.match(migration, /unread\.metadata->>'source' = 'client_portal'/);
    assert.match(migration, /now\(\) AT TIME ZONE/);
    assert.match(databaseTest, /operational staff never receives document review metadata/);
    assert.match(databaseTest, /viewer cannot access the service center/);
  });

  test("RPC permanece fechada e o contrato gerado está tipado", () => {
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.staff_client_portal_service_center\(uuid\)/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.staff_client_portal_service_center\(uuid\) TO authenticated/);
    assert.match(types, /staff_client_portal_service_center: \{/);
  });

  test("interface abre conversa e documento diretamente no contexto correto", () => {
    assert.match(component, /Central de Atendimento do Portal/);
    assert.match(component, /Todos os responsáveis/);
    assert.match(component, /onOpenCommunication\(item\.item_id\)/);
    assert.match(component, /search=\{\{ tab: "portal" \}\}/);
    assert.match(route, /<PortalServiceCenter onOpenCommunication=\{openPortalConversation\}/);
    assert.match(clientRoute, /search\.tab === "portal"/);
  });

  test("triagem altera status, prioridade e responsável sem sair da central", () => {
    assert.match(component, /useChangeCommunicationStatus/);
    assert.match(component, /useUpdateCommunicationThread/);
    assert.match(component, /useAssignCommunicationThread/);
    assert.match(component, /COMMUNICATION_STATUSES/);
    assert.match(component, /COMMUNICATION_PRIORITIES/);
    assert.match(component, /Sem responsável/);
    assert.match(communicationHook, /_priority: priority \?\? null/);
    assert.match(communicationHook, /staff-client-portal-service-center/);
  });

  test("interface mostra tempo de espera e alertas de SLA", () => {
    assert.match(component, /SLA em risco/);
    assert.match(component, /SLA atrasado/);
    assert.match(component, /Cliente aguardando há/);
    assert.match(component, /prioritizePortalServiceCenter/);
  });

  test("fila atualiza por polling e pelos eventos privados já existentes", () => {
    assert.match(component, /center\.refetch\(\)/);
    assert.match(component, /markRead\.mutate\(threadId\)/);
    assert.match(inboxHook, /staff-client-portal-service-center/);
    assert.match(realtime, /staff-client-portal-service-center/);
  });
});
