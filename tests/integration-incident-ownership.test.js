import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261011120000_integration_incident_ownership.sql");
const healthPanel = read("src/components/integrations/integration-health-panel.tsx");
const hook = read("src/hooks/use-integration-actions.ts");
const types = read("src/integrations/supabase/types.ts");

describe("responsabilidade por incidentes de integração", () => {
  test("mantém o histórico isolado e sem acesso direto do navegador", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.integration_incidents/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      migration,
      /REVOKE ALL ON TABLE public\.integration_incidents FROM PUBLIC, anon, authenticated/,
    );
    assert.match(migration, /UNIQUE \(organization_id, integration_key, source_failure_id\)/);
    assert.match(migration, /status IN \('in_progress', 'resolved'\)/);
  });

  test("consulta e gestão exigem papel administrativo na organização", () => {
    assert.match(migration, /organization_integration_incidents/);
    assert.match(migration, /manage_integration_incident/);
    assert.match(migration, /INTEGRATION_INCIDENTS_ACCESS_DENIED/);
    assert.match(migration, /INTEGRATION_INCIDENT_MANAGE_ACCESS_DENIED/);
    assert.match(
      migration,
      /ARRAY\['superadmin','proprietario','administrador'\]::public\.app_role\[\]/,
    );
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /integration_incident_' \|\| _action/);
    assert.doesNotMatch(migration, /service_role_key|raw_payload|webhook_token/);
  });

  test("interface permite assumir, encerrar e reabrir sem esconder a falha ativa", () => {
    assert.match(healthPanel, /Acompanhamento de incidentes/);
    assert.match(healthPanel, /Assumir incidente/);
    assert.match(healthPanel, /Encerrar acompanhamento/);
    assert.match(healthPanel, /Reabrir/);
    assert.match(healthPanel, /incident\.is_active_failure/);
    assert.match(hook, /useIntegrationIncidents/);
    assert.match(hook, /useManageIntegrationIncident/);
    assert.match(types, /integration_incidents:/);
    assert.match(types, /organization_integration_incidents:/);
    assert.match(types, /manage_integration_incident:/);
  });
});
