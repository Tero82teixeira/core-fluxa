import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260909120000_client_portal_pending_center.sql",
  "utf8",
);
const databaseTest = readFileSync(
  "supabase/tests/database/068_client_portal_pending_center.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-client-portal-requests.ts", "utf8");
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");
const management = readFileSync("src/components/clients/client-portal-panel.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("central segura de pendências do Meu Portal", () => {
  test("fluxo inclui correção, reenvio, aprovação e contagem de envios", () => {
    assert.match(migration, /revision_requested/);
    assert.match(migration, /company_feedback/);
    assert.match(migration, /submission_count/);
    assert.match(migration, /review_client_portal_document_request/);
    assert.match(migration, /prepare_client_portal_document_resubmission/);
  });

  test("revisão continua restrita a proprietário e administrador", () => {
    const start = migration.indexOf("FUNCTION public.review_client_portal_document_request(");
    const body = migration.slice(start, start + 3800);
    assert.match(body, /auth\.uid\(\) IS NULL/);
    assert.match(body, /ARRAY\['proprietario','administrador'\]/);
    assert.match(body, /v_request\.status <> 'submitted'/);
    assert.match(databaseTest, /unrelated user cannot prepare a resubmission/);
  });

  test("portal mostra resumo, busca, filtros, prazos e retorno da empresa", () => {
    assert.match(portal, /Central de pendências/);
    assert.match(portal, /requestSummary/);
    assert.match(portal, /Buscar pendência/);
    assert.match(portal, /Todas as situações/);
    assert.match(portal, /portalRequestDeadline/);
    assert.match(portal, /Retorno da empresa/);
    assert.match(portal, /Pendências para você/);
  });

  test("cliente pode reenviar e empresa pode aprovar ou pedir correção", () => {
    assert.match(portal, /Reenviar arquivo/);
    assert.match(hook, /prepare_client_portal_document_resubmission/);
    assert.match(management, /Pedir correção/);
    assert.match(management, /Aprovar/);
    assert.match(management, /Orientação para o cliente/);
  });

  test("projeção pública não expõe autor interno do retorno", () => {
    const start = migration.indexOf("FUNCTION public.client_portal_document_requests()");
    const signature = migration.slice(start, migration.indexOf(")\nLANGUAGE sql", start));
    assert.match(signature, /company_feedback text/);
    assert.doesNotMatch(signature, /feedback_by|completed_by|created_by/);
  });

  test("tipos incluem os novos contratos do Supabase", () => {
    assert.match(types, /prepare_client_portal_document_resubmission: \{/);
    assert.match(types, /review_client_portal_document_request: \{/);
    assert.match(types, /submission_count: number/);
    assert.match(types, /company_feedback: string/);
  });
});
