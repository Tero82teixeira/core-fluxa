import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260923120000_portal_experience.sql", "utf8");
const ratingDetailsMigration = readFileSync(
  "supabase/migrations/20260924120000_staff_portal_rating_details.sql",
  "utf8",
);
const recoveryMigration = readFileSync(
  "supabase/migrations/20260925120000_rating_recovery_workflow.sql",
  "utf8",
);
const portal = readFileSync("src/components/client-portal/portal-experience.tsx", "utf8");
const experienceHook = readFileSync("src/hooks/use-client-portal-experience.ts", "utf8");
const staff = readFileSync("src/components/communication/callback-requests-panel.tsx", "utf8");
const communicationHook = readFileSync("src/hooks/use-communication.ts", "utf8");
const report = readFileSync(
  "src/components/communication/communication-service-report.tsx",
  "utf8",
);
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("portal reply alerts are opt-in and dispatch staff answers through the service function", () => {
  assert.match(portal, /Ativar alertas/);
  assert.match(experienceHook, /register_client_portal_push_subscription/);
  assert.match(communicationHook, /mode: "dispatch"/);
  assert.match(migration, /A empresa respondeu você/);
  assert.match(migration, /TO service_role/);
});

test("resolved portal conversations accept one editable satisfaction rating", () => {
  assert.match(migration, /UNIQUE \(thread_id\)/);
  assert.match(migration, /thread\.status IN \('resolvida', 'arquivada'\)/);
  assert.match(portal, /Como foi este atendimento/);
  assert.match(report, /Satisfação média/);
});

test("callback requests create tasks and are managed inside FLUXA communication", () => {
  assert.match(migration, /INSERT INTO public\.tasks/);
  assert.match(migration, /interval '1 hour'/);
  assert.match(portal, /Pedir um retorno/);
  assert.match(staff, /Retornos pedidos pelo cliente/);
  assert.match(staff, /Confirmar/);
  assert.match(staff, /Concluir/);
});

test("experience metrics combine ratings and callbacks in the service report", () => {
  for (const metric of [
    "rating_average",
    "rating_count",
    "callback_requested",
    "callback_completed",
  ]) {
    assert.match(migration, new RegExp(metric));
  }
  assert.match(report, /Avaliações recebidas/);
  assert.match(report, /Retornos concluídos/);
});

test("management can inspect and filter rating details before opening the conversation", () => {
  assert.match(ratingDetailsMigration, /communication_assert_role\(_organization_id, true\)/);
  assert.match(ratingDetailsMigration, /rating_row\.organization_id = _organization_id/);
  assert.match(ratingDetailsMigration, /client_name text/);
  assert.match(ratingDetailsMigration, /subject text/);
  assert.match(report, /Avaliações dos clientes/);
  assert.match(report, /Todas as notas/);
  assert.match(report, /search=\{\{ conversa: item\.thread_id \}\}/);
});

test("low ratings alert the team and remain tracked until recovery", () => {
  assert.match(recoveryMigration, /NEW\.rating <= 2 THEN 'Avaliação baixa recebida'/);
  assert.match(recoveryMigration, /member\.user_id = thread\.assigned_to/);
  assert.match(recoveryMigration, /member\.role::text IN \('superadmin', 'proprietario', 'administrador', 'gestor'\)/);
  assert.match(recoveryMigration, /update_staff_client_portal_rating_recovery/);
  assert.match(report, /Precisam de contato/);
  assert.match(report, /Recuperações concluídas/);
  assert.match(report, /Recuperação do atendimento/);
});

test("generated contracts expose every portal experience RPC", () => {
  for (const rpc of [
    "register_client_portal_push_subscription",
    "client_portal_communication_ratings",
    "submit_client_portal_communication_rating",
    "create_client_portal_callback_request",
    "list_client_portal_callback_requests",
    "cancel_client_portal_callback_request",
    "list_staff_client_portal_callback_requests",
    "list_staff_client_portal_communication_ratings",
    "update_staff_client_portal_callback_request",
    "update_staff_client_portal_rating_recovery",
    "communication_experience_metrics",
  ])
    assert.match(types, new RegExp(`${rpc}:`));
});
