import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { filterWebhookEvents, integrationReportCsv } from "../src/lib/integration-observability.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261007120000_integration_observability.sql");
const connector = read("supabase/functions/asaas-connector/index.ts");
const panel = read("src/components/integrations/integration-observability-panel.tsx");
const hooks = read("src/hooks/use-integration-actions.ts");
const types = read("src/integrations/supabase/types.ts");

describe("observabilidade das integrações", () => {
  test("central unifica eventos sem expor payloads ou credenciais", () => {
    assert.match(migration, /organization_webhook_events/);
    assert.match(migration, /asaas_webhook_events/);
    assert.match(migration, /kiwify_webhook_events/);
    assert.match(migration, /communication_channel_messages/);
    assert.match(migration, /WEBHOOK_EVENTS_ACCESS_DENIED/);
    assert.doesNotMatch(
      migration,
      /raw_payload|api_key_ciphertext|api_key_iv|webhook_token_hash|p256dh|auth_key/,
    );
    assert.match(types, /organization_webhook_events:/);
  });

  test("reprocessamento Asaas consulta o estado atual e usa chave determinística", () => {
    assert.match(connector, /action === "replay_webhook_event"/);
    assert.match(
      connector,
      /\/payments\/\$\{encodeURIComponent\(webhookEvent\.provider_payment_id\)\}/,
    );
    assert.match(connector, /manual-replay-\$\{webhookEvent\.id\}-\$\{providerStatus\}/);
    assert.match(connector, /ASAAS_WEBHOOK_EVENT_NOT_REPLAYABLE/);
    assert.match(connector, /ASAAS_WEBHOOK_REPLAY_AMOUNT_INVALID/);
    assert.match(connector, /diagnostic_code: null/);
    assert.match(panel, /Reprocessar evento/);
    assert.match(panel, /Análise manual/);
  });

  test("monitor e relatório são restritos, limitados e exportáveis", () => {
    assert.match(migration, /organization_integration_credentials/);
    assert.match(migration, /CREDENTIAL_VALIDATION_STALE/);
    assert.match(migration, /organization_integration_report/);
    assert.match(migration, /interval '366 days'/);
    assert.match(panel, /Monitor de credenciais/);
    assert.match(panel, /Relatório dos últimos 30 dias/);
    assert.match(panel, /Exportar CSV/);
    assert.match(hooks, /organization_integration_report/);
  });

  test("filtros e CSV preservam os números e neutralizam fórmulas", () => {
    const events = [
      { provider: "asaas", status: "processed" },
      { provider: "kiwify", status: "failed" },
    ];
    assert.equal(filterWebhookEvents(events, "asaas", "all").length, 1);
    assert.equal(filterWebhookEvents(events, "all", "failed").length, 1);
    const csv = integrationReportCsv([
      {
        provider: "asaas",
        label: "=teste",
        total_count: 2,
        processed_count: 1,
        warning_count: 1,
        failed_count: 0,
        success_rate: 50,
        last_event_at: null,
      },
    ]);
    assert.match(csv, /"'=teste"/);
    assert.match(csv, /"50"/);
  });
});
