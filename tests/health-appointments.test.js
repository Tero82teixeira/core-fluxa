import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261018170000_health_appointments.sql",
  "utf8",
);
const page = readFileSync("src/routes/_authenticated/saude.agenda.tsx", "utf8");
const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const segments = readFileSync("src/lib/organization-segments.ts", "utf8");

describe("agenda e atendimentos do FLUXA Saúde", () => {
  test("mantém o escopo administrativo e o isolamento por empresa", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.health_appointments/);
    assert.match(migration, /ALTER TABLE public\.health_appointments ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.health_appointments FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /appointment\.organization_id = _organization_id/);
    assert.match(migration, /health_module_enabled\(_organization_id, 'health_appointments'\)/);
  });

  test("valida paciente, profissional, autorização e conflito de horário", () => {
    assert.match(migration, /HEALTH_APPOINTMENT_PATIENT_INVALID/);
    assert.match(migration, /HEALTH_APPOINTMENT_RESPONSIBLE_INVALID/);
    assert.match(migration, /HEALTH_APPOINTMENT_AUTHORIZATION_INVALID/);
    assert.match(migration, /existing\.starts_at < _ends_at/);
    assert.match(migration, /existing\.ends_at > _starts_at/);
    assert.match(migration, /HEALTH_APPOINTMENT_SCHEDULE_CONFLICT/);
  });

  test("registra criação e mudanças de status na auditoria", () => {
    assert.match(migration, /health\.appointment\.created/);
    assert.match(migration, /health\.appointment\.status_updated/);
    assert.match(migration, /previous_status/);
  });

  test("oferece agenda diária e semanal com cadastro e atualização de status", () => {
    assert.match(page, /Agenda e Atendimentos/);
    assert.match(page, /Novo atendimento/);
    assert.match(page, /value="7">7 dias/);
    assert.match(page, /useUpdateHealthAppointmentStatus/);
    assert.match(page, /Não inclua diagnóstico, prescrição ou evolução clínica/);
  });

  test("expõe o módulo no onboarding e na navegação autorizada", () => {
    assert.match(segments, /"health_appointments"/);
    assert.match(segments, /"\/saude\/agenda": "health_appointments"/);
    assert.match(navigation, /to: "\/saude\/agenda"/);
    assert.match(navigation, /label: "Agenda e Atendimentos"/);
  });
});
