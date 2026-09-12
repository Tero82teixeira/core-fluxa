import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { asaasCollectionSummary, asaasErrorMessage } from "../src/lib/asaas.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261001120000_asaas_recurring_collection.sql");
const automation = read("supabase/functions/asaas-billing-automation/index.ts");
const connector = read("supabase/functions/asaas-connector/index.ts");
const finance = read("src/routes/_authenticated/financeiro.tsx");
const portal = read("src/routes/meu-portal.tsx");
const databaseTypes = read("src/integrations/supabase/types.ts");

describe("automação de cobranças recorrentes Asaas", () => {
  test("é opt-in, antecipável e enfileira cada lançamento uma única vez", () => {
    assert.match(migration, /asaas_auto_charge boolean NOT NULL DEFAULT false/);
    assert.match(migration, /asaas_charge_days_before BETWEEN 0 AND 30/);
    assert.match(migration, /UNIQUE \(organization_id, transaction_id\)/);
    assert.match(migration, /financial_transaction_asaas_queue/);
    assert.match(migration, /ON CONFLICT \(organization_id, transaction_id\) DO NOTHING/);
    assert.match(databaseTypes, /asaas_charge_jobs:/);
    assert.match(databaseTypes, /asaas_auto_charge: boolean/);
  });

  test("execução agendada usa credencial cifrada e autenticação de serviço", () => {
    assert.match(automation, /ASAAS_CREDENTIALS_ENCRYPTION_KEY/);
    assert.match(automation, /safeEqual\(token, serviceKey\)/);
    assert.match(automation, /request\.headers\.get\("apikey"\)/);
    assert.match(automation, /safeEqual\(apiKey, serviceKey\)/);
    assert.match(automation, /ASAAS_BILLING_AUTOMATION_KEY/);
    assert.match(automation, /x-fluxa-automation-key/);
    assert.match(automation, /safeEqual\(suppliedAutomationKey, automationKey\)/);
    assert.match(automation, /externalReference:\s*transaction\.id/);
    assert.match(automation, /claim_asaas_charge_jobs/);
    assert.match(automation, /complete_asaas_charge_job/);
    assert.doesNotMatch(automation, /api_key_ciphertext[\s\S]{0,80}console\./);
  });

  test("lembretes do portal são idempotentes e abrem a cobrança certa", () => {
    assert.match(migration, /days_until IN \(3,1,0,-3,-7\)/);
    assert.match(migration, /asaas-payment-reminder:/);
    assert.match(migration, /ON CONFLICT DO NOTHING/);
    assert.match(migration, /\/meu-portal\?tab=pagamentos&charge=/);
    assert.match(portal, /entityType === "asaas_charge"/);
    assert.match(portal, /highlightedEntity/);
  });

  test("painel mostra atraso, conciliação, sincronização e nova tentativa", () => {
    for (const label of [
      "Clientes inadimplentes",
      "Tempo de atraso",
      "Conciliação Asaas",
      "Sincronizar",
      "Tentar novamente",
    ]) {
      assert.match(finance, new RegExp(label));
    }
    assert.match(connector, /action\s*===\s*"sync_charge"/);
    assert.match(connector, /action\s*===\s*"retry_charge_job"/);
  });
});

describe("resumo de cobrança Asaas", () => {
  const charges = [
    {
      id: "late-1",
      client_id: "client-a",
      transaction_id: "transaction-a",
      amount: 100,
      due_date: "2026-09-10",
      status: "overdue",
    },
    {
      id: "late-2",
      client_id: "client-a",
      transaction_id: "transaction-b",
      amount: 50,
      due_date: "2026-08-01",
      status: "pending",
    },
    {
      id: "received",
      client_id: "client-b",
      transaction_id: "transaction-c",
      amount: 75,
      due_date: "2026-09-01",
      status: "received",
    },
  ];

  test("soma valores sem contar o mesmo cliente inadimplente duas vezes", () => {
    const summary = asaasCollectionSummary(
      charges,
      [],
      [
        { id: "transaction-a", status: "overdue" },
        { id: "transaction-b", status: "pending" },
        { id: "transaction-c", status: "paid" },
      ],
      new Date("2026-09-12T12:00:00"),
    );
    assert.equal(summary.awaiting, 150);
    assert.equal(summary.overdue, 150);
    assert.equal(summary.received, 75);
    assert.equal(summary.delinquentClients, 1);
    assert.deepEqual(summary.aging, { firstWeek: 100, firstMonth: 0, older: 50 });
    assert.equal(summary.issues, 0);
  });

  test("detecta falha de fila e divergência de conciliação", () => {
    const summary = asaasCollectionSummary(
      charges,
      [{ id: "job", transaction_id: "transaction-a", status: "failed", attempts: 2 }],
      [
        { id: "transaction-a", status: "paid" },
        { id: "transaction-b", status: "pending" },
        { id: "transaction-c", status: "pending" },
      ],
      new Date("2026-09-12T12:00:00"),
    );
    assert.equal(summary.issues, 3);
  });

  test("transforma códigos técnicos em orientação prática", () => {
    assert.match(asaasErrorMessage("ASAAS_CLIENT_DOCUMENT_REQUIRED"), /CPF ou CNPJ/);
    assert.match(asaasErrorMessage("ASAAS_NOT_CONNECTED"), /Conecte a conta Asaas/);
  });
});
