import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261018220000_health_reception_queue.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-health-appointments.ts", "utf8");
const agenda = readFileSync("src/routes/_authenticated/saude.agenda.tsx", "utf8");
const dashboard = readFileSync("src/routes/_authenticated/saude.painel-clinica.tsx", "utf8");
const dashboardSummary = readFileSync("src/lib/health-clinic-dashboard.ts", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("recepção e fila administrativa da clínica", () => {
  test("mantém recepção separada do resultado do atendimento", () => {
    assert.match(migration, /reception_status text NOT NULL DEFAULT 'aguardando'/);
    assert.match(migration, /'aguardando', 'chegou', 'em_atendimento'/);
    assert.match(migration, /checked_in_at timestamptz/);
    assert.match(migration, /service_started_at timestamptz/);
    assert.match(migration, /reception_status = 'aguardando'[\s\S]*checked_in_at IS NULL/);
    assert.doesNotMatch(migration, /DROP CONSTRAINT IF EXISTS health_appointments_status_check/);
  });

  test("bloqueia reagendamento depois que a recepção começou", () => {
    assert.match(migration, /protect_health_appointment_after_check_in/);
    assert.match(migration, /OLD\.reception_status <> 'aguardando'/);
    assert.match(migration, /NEW\.starts_at IS DISTINCT FROM OLD\.starts_at/);
    assert.match(migration, /HEALTH_APPOINTMENT_RECEPTION_ALREADY_STARTED/);
  });

  test("aceita somente chegada seguida do início do atendimento", () => {
    assert.match(migration, /_status NOT IN \('chegou', 'em_atendimento'\)/);
    assert.match(migration, /appointment\.status NOT IN \('agendado', 'confirmado'\)/);
    assert.match(
      migration,
      /_status = 'chegou'[\s\S]*appointment\.reception_status <> 'aguardando'/,
    );
    assert.match(
      migration,
      /_status = 'em_atendimento'[\s\S]*appointment\.reception_status <> 'chegou'/,
    );
    assert.match(migration, /FOR UPDATE/);
  });

  test("protege organização, módulo, papéis e trilha de auditoria", () => {
    assert.match(migration, /health_module_enabled\(_organization_id, 'health_appointments'\)/);
    assert.match(migration, /'operacional','atendimento'/);
    assert.match(migration, /organization_id = _organization_id/);
    assert.match(migration, /health\.appointment\.checked_in/);
    assert.match(migration, /health\.appointment\.service_started/);
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.update_health_appointment_reception_status\(uuid, uuid, text\)[\s\S]*FROM PUBLIC, anon, service_role/,
    );
  });

  test("expõe a fila sem revelar faturamento a papéis operacionais", () => {
    assert.match(migration, /'reception_status', appointment\.reception_status/);
    assert.match(migration, /'checked_in_at', appointment\.checked_in_at/);
    assert.match(migration, /CASE WHEN can_view_billing THEN billing\.id ELSE NULL END/);
    assert.match(types, /update_health_appointment_reception_status/);
  });

  test("Agenda oferece ações rápidas e tempo de espera", () => {
    assert.match(hook, /useUpdateHealthAppointmentReceptionStatus/);
    assert.match(hook, /update_health_appointment_reception_status/);
    assert.match(agenda, /Registrar chegada/);
    assert.match(agenda, /Iniciar atendimento/);
    assert.match(agenda, /waitingTime/);
    assert.match(agenda, /reception_status === "aguardando"/);
  });

  test("Painel da Clínica mostra a fila e os dois indicadores", () => {
    assert.match(dashboard, /Fila da recepção/);
    assert.match(dashboard, /Aguardando há/);
    assert.match(dashboard, /Em atendimento/);
    assert.match(dashboardSummary, /reception_status === "chegou"/);
    assert.match(dashboardSummary, /reception_status === "em_atendimento"/);
  });

  test("permanece administrativo e não cria outro relógio", () => {
    assert.match(migration, /Não armazena prontuário, diagnóstico, prescrição ou evolução clínica/);
    assert.doesNotMatch(migration, /cron\.schedule|run_temporal_automation_cycle/);
  });
});
