import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const communication = readFileSync("src/routes/_authenticated/comunicacao.tsx", "utf8");
const savedFilters = readFileSync(
  "src/components/communication/communication-saved-filters.tsx",
  "utf8",
);
const savedFiltersHelper = readFileSync("src/lib/communication-saved-filters.ts", "utf8");
const bulkActions = readFileSync(
  "src/components/communication/communication-bulk-actions.tsx",
  "utf8",
);
const clientQuickView = readFileSync("src/components/communication/client-quick-view.tsx", "utf8");
const clientsHook = readFileSync("src/hooks/use-operations.ts", "utf8");

test("saved filters are isolated by organization and bounded on the device", () => {
  assert.match(savedFiltersHelper, /fluxa:communication-filters:\$\{organizationId\}/);
  assert.match(savedFiltersHelper, /MAX_SAVED_FILTERS = 8/);
  assert.match(savedFiltersHelper, /try \{[\s\S]*JSON\.parse[\s\S]*\} catch \{/);
  assert.match(savedFilters, /window\.localStorage/);
  assert.match(savedFilters, /Filtro salvo neste dispositivo/);
  assert.match(communication, /<CommunicationSavedFilters/);
});

test("bulk actions require an explicit selection and reuse protected mutations", () => {
  assert.match(communication, /selectedIds\.size>0/);
  assert.match(communication, /Selecionar exibidas/);
  assert.match(bulkActions, /useChangeCommunicationStatus/);
  assert.match(bulkActions, /useUpdateCommunicationThread/);
  assert.match(bulkActions, /useAssignCommunicationThread/);
  assert.match(bulkActions, /Promise\.all/);
  assert.match(bulkActions, /canAssign/);
});

test("the selected conversation shows an actionable client overview", () => {
  assert.match(communication, /<ClientQuickView/);
  assert.match(clientQuickView, /Visão rápida do cliente/);
  assert.match(clientQuickView, /Processos ativos/);
  assert.match(clientQuickView, /Tarefas abertas/);
  assert.match(clientQuickView, /Conversas abertas/);
  assert.match(clientQuickView, /https:\/\/wa\.me/);
  assert.match(clientQuickView, /mailto:/);
  assert.match(clientQuickView, /tel:/);
  assert.match(clientsHook, /const CLIENTS_SOURCE = "clients_secure"/);
});

test("no automatic message or destructive bulk action is introduced", () => {
  assert.doesNotMatch(bulkActions, /add_communication_entry|sendReply|delete/);
  assert.doesNotMatch(savedFilters, /supabase|fetch\(/);
});
