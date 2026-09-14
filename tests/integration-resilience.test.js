import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261006120000_integration_resilience.sql");
const panel = read("src/components/integrations/integration-health-panel.tsx");
const actions = read("src/hooks/use-integration-actions.ts");
const asaas = read("supabase/functions/asaas-connector/index.ts");
const channels = read("supabase/functions/communication-channel-send/index.ts");
const copilot = read("supabase/functions/communication-copilot/index.ts");
const automation = read("supabase/functions/asaas-billing-automation/index.ts");
const types = read("src/integrations/supabase/types.ts");

describe("resiliência das integrações", () => {
  test("testes de conexão não criam cobrança nem enviam mensagem ao cliente", () => {
    assert.match(asaas, /action === "test_connection"/);
    assert.match(asaas, /asaas\(apiKey, connection\.environment, "\/myAccount"\)/);
    assert.match(channels, /body\.mode === "test_connection"/);
    assert.match(channels, /graph\.facebook\.com/);
    assert.match(channels, /api\.resend\.com\/domains/);
    assert.match(copilot, /mode === "health"/);
    assert.match(copilot, /api\.openai\.com\/v1\/models/);
    assert.doesNotMatch(
      asaas.slice(
        asaas.indexOf('action === "test_connection"'),
        asaas.indexOf('action === "replay_webhook_event"'),
      ),
      /\/payments|\/customers/,
    );
  });

  test("somente administradores podem consultar falhas e receber alertas", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.organization_integration_failures/);
    assert.match(migration, /INTEGRATION_FAILURES_ACCESS_DENIED/);
    assert.match(migration, /'superadmin','proprietario','administrador'/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.notify_integration_failure/);
    assert.match(migration, /INSERT INTO public\.notifications/);
    assert.match(migration, /ON CONFLICT DO NOTHING/);
    assert.match(migration, /CREATE TABLE public\.integration_alert_push_claims/);
    assert.match(migration, /claim_integration_alert_push_deliveries/);
    assert.match(automation, /"claim_integration_alert_push_deliveries"/);
    assert.match(automation, /"integration-alert"/);
    assert.match(types, /organization_integration_failures:/);
    assert.match(types, /integration_alert_push_claims:/);
  });

  test("reprocessamento fica restrito às cobranças idempotentes do Asaas", () => {
    assert.match(migration, /true AS retryable/);
    assert.match(migration, /message\.status = 'failed'/);
    assert.match(actions, /integrationKey === "asaas"/);
    assert.match(panel, /Falhas recentes e reprocessamento/);
    assert.match(panel, /Cobrança recolocada na fila com segurança/);
    assert.match(panel, /Análise manual/);
  });
});
