import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { buildIntegrationSupportDiagnostic } from "../src/lib/integration-support-diagnostic.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261010120000_integration_support_diagnostics.sql");
const healthPanel = read("src/components/integrations/integration-health-panel.tsx");
const observabilityPanel = read("src/components/integrations/integration-observability-panel.tsx");
const types = read("src/integrations/supabase/types.ts");

describe("diagnóstico operacional das integrações", () => {
  test("resume o último processamento Asaas e protege o acesso por organização", () => {
    assert.match(migration, /organization_asaas_automation_status/);
    assert.match(migration, /ASAAS_AUTOMATION_STATUS_ACCESS_DENIED/);
    assert.match(migration, /public\.has_org_role/);
    assert.match(migration, /last_run_at - interval '5 minutes'/);
    assert.match(migration, /job\.status IN \('pending','processing'\)/);
    assert.match(migration, /REVOKE ALL[\s\S]+FROM PUBLIC, anon, service_role/);
    assert.match(types, /organization_asaas_automation_status:/);
    assert.match(healthPanel, /Último processamento com cobranças/);
    assert.match(healthPanel, /Fila vazia/);
  });

  test("diagnóstico copiado não inclui rotas, identificadores ou conteúdo sensível", () => {
    const secret = "SEGREDO-NAO-PODE-SAIR";
    const diagnostic = buildIntegrationSupportDiagnostic({
      generatedAt: "2026-09-15T12:00:00.000Z",
      health: [
        {
          integration_key: "asaas",
          label: secret,
          category: "servico",
          status: "healthy",
          expected_version: null,
          reported_version: null,
          last_activity_at: null,
          pending_count: 0,
          error_count: 0,
          last_error_code: null,
          action_url: `/configuracoes?token=${secret}`,
          action_label: secret,
          raw_payload: secret,
        },
      ],
      credentials: [
        {
          integration_key: "asaas",
          label: secret,
          status: "healthy",
          last_validated_at: null,
          days_since_validation: null,
          diagnostic_code: null,
          action_url: `/segredo/${secret}`,
          api_key: secret,
        },
      ],
      report: [
        {
          provider: "asaas",
          label: secret,
          total_count: 1,
          processed_count: 1,
          warning_count: 0,
          failed_count: 0,
          success_rate: 100,
          last_event_at: null,
          customer_content: secret,
        },
      ],
      asaasAutomation: {
        last_run_at: null,
        processed_count: 0,
        succeeded_count: 0,
        failed_count: 0,
        queued_count: 0,
        next_attempt_at: null,
      },
    });

    assert.doesNotMatch(diagnostic, new RegExp(secret));
    assert.doesNotMatch(diagnostic, /action_url|raw_payload|api_key|customer_content/);
    assert.match(diagnostic, /"integration_key": "asaas"/);
    assert.match(observabilityPanel, /Copiar diagnóstico/);
    assert.match(observabilityPanel, /Não inclui secrets nem conteúdo/);
  });
});
