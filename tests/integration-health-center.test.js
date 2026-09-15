import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  integrationDeploymentNotice,
  integrationDiagnosticMessage,
  integrationHealthSummary,
} from "../src/lib/integration-health.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261005120000_integration_health_center.sql");
const settings = read("src/routes/_authenticated/configuracoes.tsx");
const panel = read("src/components/integrations/integration-health-panel.tsx");
const databaseTypes = read("src/integrations/supabase/types.ts");
const runtime = read("supabase/functions/_shared/integration-runtime.ts");
const functionPaths = [
  "asaas-billing-automation",
  "asaas-connector",
  "asaas-webhook",
  "communication-channel-send",
  "communication-channel-webhook",
  "communication-push",
  "kiwify-webhook",
];

describe("central de saúde das integrações", () => {
  test("resume estados e traduz divergência de implantação", () => {
    const base = {
      integration_key: "test",
      label: "Teste",
      category: "servico",
      expected_version: null,
      reported_version: null,
      last_activity_at: null,
      pending_count: 0,
      error_count: 0,
      last_error_code: null,
      action_url: "/configuracoes",
      action_label: "Abrir",
    };
    assert.deepEqual(
      integrationHealthSummary([
        { ...base, status: "healthy" },
        { ...base, status: "attention" },
        { ...base, status: "outdated" },
        { ...base, status: "pending" },
        { ...base, status: "not_configured" },
      ]),
      { healthy: 1, attention: 2, pending: 1, notConfigured: 1 },
    );
    assert.match(integrationDiagnosticMessage("FUNCTION_VERSION_OUTDATED"), /GitHub/);
    assert.match(integrationDiagnosticMessage("ASAAS_invalid_mobilePhone"), /telefone/);
    assert.equal(
      integrationDeploymentNotice([{ ...base, category: "implantacao", status: "not_reported" }]),
      "awaiting_first_run",
    );
    assert.equal(
      integrationDeploymentNotice([
        { ...base, category: "implantacao", status: "not_reported" },
        { ...base, category: "implantacao", status: "outdated" },
      ]),
      "outdated",
    );
  });

  test("RPC protege dados por organização e não devolve segredos", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.integration_runtime_heartbeats/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.organization_integration_health/);
    assert.match(migration, /public\.has_org_role/);
    assert.match(migration, /INTEGRATION_HEALTH_ACCESS_DENIED/);
    assert.match(migration, /auth\.role\(\) <> 'service_role'/);
    assert.match(migration, /FUNCTION_VERSION_NOT_REPORTED/);
    assert.match(migration, /FUNCTION_VERSION_OUTDATED/);
    assert.doesNotMatch(
      migration,
      /api_key_ciphertext|api_key_iv|webhook_token_hash|p256dh|auth_key|raw_payload/,
    );
    assert.match(databaseTypes, /organization_integration_health:/);
    assert.match(databaseTypes, /record_integration_runtime_heartbeat:/);
  });

  test("todas as Edge Functions informam a mesma release ativa", () => {
    assert.match(runtime, /EDGE_FUNCTION_RELEASE = "2026\.10\.08\.1"/);
    assert.match(read("supabase/functions/communication-copilot/index.ts"), /runtimeHeaders/);
    for (const functionName of functionPaths) {
      const source = read(`supabase/functions/${functionName}/index.ts`);
      assert.match(source, /runtimeHeaders/);
      assert.match(source, new RegExp(`recordIntegrationHeartbeat\\([^;]+"${functionName}"`));
    }
  });

  test("interface separa saúde dos serviços e versões publicadas", () => {
    assert.match(settings, /\["integracoes", "Integrações"\]/);
    assert.match(settings, /<IntegrationHealthPanel/);
    assert.match(panel, /Saúde das integrações/);
    assert.match(panel, /Serviços da organização/);
    assert.match(panel, /Versões publicadas/);
    assert.match(panel, /Algumas funções aguardam a primeira execução/);
    assert.match(panel, /A publicação não está com erro/);
    assert.match(panel, /Cobrança aguardando o próximo ciclo automático/);
    assert.match(panel, /Atualizar diagnóstico/);
  });

  test("inscrições push expiradas são desativadas automaticamente", () => {
    for (const functionName of ["communication-push", "asaas-billing-automation"]) {
      const source = read(`supabase/functions/${functionName}/index.ts`);
      assert.match(source, /status === 404 \|\| status === 410/);
      assert.match(source, /update\(\{ is_active: false/);
    }
  });
});
