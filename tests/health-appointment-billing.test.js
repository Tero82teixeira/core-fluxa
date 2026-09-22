import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261018180000_health_appointment_billing.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-health-appointments.ts", "utf8");
const page = readFileSync("src/routes/_authenticated/saude.agenda.tsx", "utf8");

describe("integração entre atendimento e conta médica", () => {
  test("mantém um único faturamento por atendimento", () => {
    assert.match(migration, /appointment_id uuid/);
    assert.match(migration, /health_billing_items_appointment_unique_idx/);
    assert.match(migration, /HEALTH_APPOINTMENT_ALREADY_BILLED/);
  });

  test("conclui e fatura na mesma função transacional", () => {
    assert.match(migration, /complete_health_appointment_and_create_billing/);
    assert.match(migration, /SET status = 'concluido'/);
    assert.match(migration, /INSERT INTO public\.health_billing_items/);
    assert.match(migration, /health\.appointment\.completed_and_billed/);
    assert.match(migration, /health\.billing\.created_from_appointment/);
  });

  test("protege o faturamento por papel, módulo e organização", () => {
    assert.match(migration, /'financeiro'/);
    assert.match(migration, /health_module_enabled\(_organization_id, 'health_appointments'\)/);
    assert.match(migration, /health_module_enabled\(_organization_id, 'health_billing'\)/);
    assert.match(migration, /organization_id = _organization_id/);
  });

  test("expõe uma ação explícita na agenda e atualiza os dois domínios", () => {
    assert.match(page, /Concluir e faturar/);
    assert.match(page, /Conta médica criada/);
    assert.match(hook, /complete_health_appointment_and_create_billing/);
    assert.match(hook, /health-billing-items/);
    assert.match(hook, /health-appointments/);
  });

  test("não introduz conteúdo clínico", () => {
    assert.match(migration, /Não armazena prontuário, diagnóstico, prescrição ou evolução clínica/);
    assert.match(page, /Não use este campo para informações clínicas/);
  });
});
