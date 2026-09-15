import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261009120000_integration_operations.sql");
const healthPanel = read("src/components/integrations/integration-health-panel.tsx");
const observabilityPanel = read("src/components/integrations/integration-observability-panel.tsx");

describe("operação diária das integrações", () => {
  test("confirmações pendentes ficam separadas de erros reais", () => {
    assert.match(healthPanel, /summary\.awaitingConfirmation/);
    assert.match(healthPanel, /aguardando uso/);
  });

  test("credenciais podem ser testadas diretamente no monitor", () => {
    assert.match(observabilityPanel, /useTestIntegrationConnection/);
    assert.match(observabilityPanel, /Testar agora/);
    assert.match(observabilityPanel, /credential\.status === "not_configured"/);
    assert.match(observabilityPanel, /Conexão verificada com sucesso/);
  });

  test("relatório inclui mensagens recebidas e enviadas", () => {
    assert.match(migration, /'received','sent','delivered','read'/);
    assert.doesNotMatch(migration, /message\.direction = 'inbound'/);
    assert.match(migration, /message\.status = 'failed'/);
  });

  test("relatório preserva isolamento administrativo", () => {
    assert.match(migration, /INTEGRATION_REPORT_ACCESS_DENIED/);
    assert.match(migration, /public\.has_org_role/);
    assert.match(migration, /FROM PUBLIC, anon, service_role/);
    assert.match(migration, /TO authenticated/);
    assert.doesNotMatch(migration, /raw_payload|api_key|webhook_token|p256dh|auth_key/);
  });
});
