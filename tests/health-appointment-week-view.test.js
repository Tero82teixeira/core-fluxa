import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261018210000_health_appointment_week_view.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-health-appointments.ts", "utf8");
const page = readFileSync("src/routes/_authenticated/saude.agenda.tsx", "utf8");

describe("visão semanal da Agenda Saúde", () => {
  test("limita a consulta a um período curto e válido", () => {
    assert.match(migration, /list_health_appointments_range/);
    assert.match(migration, /_end_date > \(_start_date \+ 30\)/);
    assert.match(migration, /HEALTH_APPOINTMENT_RANGE_INVALID/);
  });

  test("usa o fuso da organização para filtrar e agrupar", () => {
    assert.match(migration, /pg_timezone_names/);
    assert.match(migration, /America\/Sao_Paulo/);
    assert.match(migration, /appointment_date/);
    assert.match(migration, /BETWEEN _start_date AND _end_date/);
  });

  test("mantém isolamento, papéis, módulo e sigilo financeiro", () => {
    assert.match(migration, /health_module_enabled\(_organization_id, 'health_appointments'\)/);
    assert.match(migration, /appointment\.organization_id = _organization_id/);
    assert.match(migration, /can_view_billing/);
    assert.match(migration, /REVOKE ALL ON FUNCTION/);
  });

  test("oferece alternância, navegação e os sete dias na interface", () => {
    assert.match(page, /Agenda semanal/);
    assert.match(page, /Agenda diária/);
    assert.match(page, /weekDays/);
    assert.match(page, /Hoje/);
    assert.match(page, /Semana anterior/);
    assert.match(page, /Próxima semana/);
  });

  test("consulta o período pelo mesmo cache da Agenda", () => {
    assert.match(hook, /list_health_appointments_range/);
    assert.match(hook, /"health-appointments"/);
    assert.match(hook, /startDate/);
    assert.match(hook, /endDate/);
  });

  test("permanece fora do prontuário clínico", () => {
    assert.match(migration, /Não armazena prontuário, diagnóstico, prescrição ou evolução clínica/);
  });
});
