import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261018200000_health_appointment_rescheduling.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-health-appointments.ts", "utf8");
const page = readFileSync("src/routes/_authenticated/saude.agenda.tsx", "utf8");

describe("reagendamento seguro de atendimentos", () => {
  test("permite reagendar apenas compromissos ainda ativos", () => {
    assert.match(migration, /appointment\.status NOT IN \('agendado','confirmado'\)/);
    assert.match(migration, /HEALTH_APPOINTMENT_RESCHEDULE_NOT_ALLOWED/);
  });

  test("revalida conflitos sem comparar o atendimento com ele mesmo", () => {
    assert.match(migration, /HEALTH_APPOINTMENT_PROFESSIONAL_CONFLICT/);
    assert.match(migration, /HEALTH_APPOINTMENT_PATIENT_CONFLICT/);
    assert.match(migration, /existing\.id <> appointment\.id/g);
    assert.match(migration, /pg_advisory_xact_lock/);
  });

  test("exige nova confirmação e registra auditoria completa", () => {
    assert.match(migration, /status = 'agendado'/);
    assert.match(migration, /health\.appointment\.rescheduled/);
    assert.match(migration, /previous_starts_at/);
    assert.match(migration, /previous_status/);
  });

  test("protege escrita por organização, papel e módulo", () => {
    assert.match(migration, /health_module_enabled\(_organization_id, 'health_appointments'\)/);
    assert.match(migration, /organization_id = _organization_id/);
    assert.match(migration, /'operacional','atendimento'/);
    assert.match(migration, /REVOKE ALL ON FUNCTION/);
  });

  test("expõe a ação na Agenda e atualiza a consulta", () => {
    assert.match(page, /Reagendar/);
    assert.match(page, /aguardando nova confirmação/);
    assert.match(hook, /reschedule_health_appointment/);
    assert.match(hook, /health-appointments/);
  });

  test("permanece fora do prontuário clínico", () => {
    assert.match(migration, /Não armazena prontuário, diagnóstico, prescrição ou evolução clínica/);
  });
});
