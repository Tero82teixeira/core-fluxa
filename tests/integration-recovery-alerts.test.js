import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261012120000_integration_recovery_alerts.sql");
const panel = read("src/components/integrations/integration-health-panel.tsx");
const notifications = read("src/lib/notifications.ts");
const notificationsRoute = read("src/routes/_authenticated/notificacoes.tsx");

describe("alertas de falha e recuperação das integrações", () => {
  test("somente uma recuperação real gera o aviso de normalização", () => {
    assert.match(migration, /WHEN 'asaas_charge_jobs' THEN current_status = 'succeeded'/);
    assert.match(migration, /current_status IN \('received', 'sent', 'delivered', 'read'\)/);
    assert.match(
      migration,
      /WHEN 'communication_channel_connections' THEN current_status = 'active'/,
    );
    assert.doesNotMatch(migration, /current_status = 'pending'.*is_recovery/);
    assert.doesNotMatch(migration, /current_status = 'processing'.*is_recovery/);
    assert.match(migration, /Cobrança automática normalizada/);
    assert.match(migration, /Integração de comunicação restabelecida/);
  });

  test("falhas repetidas não duplicam alerta e novas tentativas continuam identificadas", () => {
    assert.match(migration, /should_notify_failure := is_failure/);
    assert.match(migration, /previous_row->>'attempts' IS DISTINCT FROM current_row->>'attempts'/);
    assert.match(migration, /ON CONFLICT DO NOTHING/);
    assert.match(migration, /notification_key \|\| ':' \|\| member\.user_id::text/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_asaas_charge_job/);
    assert.doesNotMatch(migration, /Cobrança automática precisa de atenção/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.complete_asaas_charge_job/);
  });

  test("incidente acompanhado acompanha falha recorrente e recuperação", () => {
    assert.match(migration, /integration_incident_reopened_automatically/);
    assert.match(migration, /integration_incident_resolved_automatically/);
    assert.match(migration, /incident\.status = 'resolved'/);
    assert.match(migration, /incident\.status = 'in_progress'/);
    assert.match(migration, /INSERT INTO public\.audit_logs/);
  });

  test("avisos continuam limitados à gestão e ficam fáceis de filtrar", () => {
    assert.match(
      migration,
      /ARRAY\['superadmin','proprietario','administrador'\]::public\.app_role\[\]/,
    );
    assert.match(migration, /'integration', 'integration'/);
    assert.match(notifications, /"integration"/);
    assert.match(notificationsRoute, /\["integration", "Integrações"\]/);
    assert.match(panel, /recebem avisos quando uma falha surge/);
    assert.doesNotMatch(migration, /raw_payload|api_key|webhook_token|content\s*\|\|/);
  });
});
