import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const page = readFileSync("src/routes/_authenticated/saude.painel-clinica.tsx", "utf8");
const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const modules = readFileSync("src/lib/organization-segments.ts", "utf8");
const billingHook = readFileSync("src/hooks/use-health-billing.ts", "utf8");
const denialHook = readFileSync("src/hooks/use-health-denials.ts", "utf8");

describe("Painel da Clínica", () => {
  test("reúne agenda, autorizações, faturamento e glosas sem novo backend", () => {
    assert.match(page, /useHealthAppointments/);
    assert.match(page, /useHealthAuthorizations/);
    assert.match(page, /useHealthBillingItems/);
    assert.match(page, /useHealthDenials/);
    assert.doesNotMatch(page, /supabase\.rpc/);
  });

  test("protege os indicadores financeiros por papel", () => {
    assert.match(page, /canViewBilling/);
    assert.match(page, /proprietario/);
    assert.match(billingHook, /organizationId && enabled/);
    assert.match(denialHook, /organizationId && enabled/);
  });

  test("fica disponível na operação e depende do módulo de Agenda", () => {
    assert.match(navigation, /\/saude\/painel-clinica/);
    assert.match(navigation, /Painel da Clínica/);
    assert.match(modules, /"\/saude\/painel-clinica": "health_appointments"/);
  });

  test("mantém a tela estritamente administrativa", () => {
    assert.match(page, /sem prontuário, diagnóstico, prescrição ou evolução clínica/i);
  });
});
