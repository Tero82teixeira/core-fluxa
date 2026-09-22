import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261018170000_health_appointments.sql",
  "utf8",
);
const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const segments = readFileSync("src/lib/organization-segments.ts", "utf8");
const page = readFileSync(
  "src/routes/_authenticated/saude.agenda.tsx",
  "utf8",
);

describe("agenda administrativa do FLUXA Saúde", () => {
  test("mantém a agenda fora do prontuário clínico", () => {
    assert.match(migration, /Não armazena prontuário, diagnóstico, prescrição ou evolução clínica/);
    assert.match(page, /não registrar prontuário/);
  });

  test("isola dados por organização e módulo", () => {
    assert.match(migration, /organization_id uuid NOT NULL/);
    assert.match(migration, /health_module_enabled\(_organization_id, 'health_appointments'\)/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  });

  test("bloqueia sobreposição de profissional e paciente", () => {
    assert.match(migration, /HEALTH_APPOINTMENT_PROFESSIONAL_CONFLICT/);
    assert.match(migration, /HEALTH_APPOINTMENT_PATIENT_CONFLICT/);
    assert.match(migration, /tstzrange/);
  });

  test("registra agenda como módulo e item de navegação", () => {
    assert.match(segments, /"health_appointments"/);
    assert.match(segments, /"\/saude\/agenda": "health_appointments"/);
    assert.match(navigation, /to: "\/saude\/agenda"/);
  });

  test("permite ciclo operacional básico do atendimento", () => {
    assert.match(migration, /'agendado','confirmado','concluido','faltou','cancelado'/);
    assert.match(migration, /health\.appointment\.created/);
    assert.match(migration, /health\.appointment\.status_changed/);
  });
});
