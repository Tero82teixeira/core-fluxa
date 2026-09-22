import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261018190000_health_appointment_reminders.sql",
  "utf8",
);
const temporalCycle = readFileSync(
  "supabase/migrations/20261018160000_health_operational_alerts.sql",
  "utf8",
);
const agenda = readFileSync(
  "src/routes/_authenticated/saude.agenda.tsx",
  "utf8",
);

describe("confirmação e lembretes administrativos de atendimentos", () => {
  test("reutiliza o relógio temporal único sem criar outro cron", () => {
    assert.match(temporalCycle, /create_health_operational_notifications/);
    assert.doesNotMatch(migration, /cron\.schedule|CREATE EXTENSION.*pg_cron/i);
  });

  test("avisa sobre confirmação, proximidade e resultado pendente", () => {
    assert.match(migration, /appointment_confirmation_due/);
    assert.match(migration, /interval '24 hours'/);
    assert.match(migration, /appointment_upcoming/);
    assert.match(migration, /interval '2 hours'/);
    assert.match(migration, /appointment_outcome_pending/);
    assert.match(migration, /appointment\.status IN \('agendado','confirmado'\)/);
  });

  test("mantém isolamento, módulo e destinatários administrativos", () => {
    assert.match(migration, /health_module_enabled\(appointment\.organization_id, 'health_appointments'\)/);
    assert.match(migration, /appointment\.organization_id/);
    assert.match(migration, /'operacional','atendimento'/);
    assert.match(migration, /member\.organization_id = alert\.organization_id/);
  });

  test("deduplica cada lembrete por atendimento, horário e usuário", () => {
    assert.match(migration, /health-appointment-confirm:/);
    assert.match(migration, /health-appointment-upcoming:/);
    assert.match(migration, /health-appointment-outcome:/);
    assert.match(migration, /recipient\.dedupe_base \|\| ':' \|\| recipient\.user_id::text/);
    assert.match(migration, /ON CONFLICT DO NOTHING/);
  });

  test("abre a Agenda diretamente no dia do atendimento", () => {
    assert.match(migration, /\/saude\/agenda\?date=/);
    assert.match(agenda, /validateSearch/);
    assert.match(agenda, /requestedDate \|\| localDateInputValue/);
  });

  test("deixa a confirmação clara na Agenda", () => {
    assert.match(agenda, /Aguardando confirmação/);
    assert.match(agenda, /A confirmar/);
    assert.match(agenda, /Confirmar presença/);
    assert.match(agenda, /Lembretes administrativos automáticos/);
  });

  test("permanece fora do prontuário clínico", () => {
    assert.match(migration, /Não armazena prontuário, diagnóstico, prescrição ou evolução clínica/);
  });
});
