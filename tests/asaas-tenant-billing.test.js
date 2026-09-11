import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260930120000_asaas_tenant_billing.sql");
const connector = read("supabase/functions/asaas-connector/index.ts");
const webhook = read("supabase/functions/asaas-webhook/index.ts");
const finance = read("src/routes/_authenticated/financeiro.tsx");
const portal = read("src/routes/meu-portal.tsx");
const settings = read("src/components/finance/asaas-settings.tsx");

describe("cobranças Asaas por organização", () => {
  test("segredo é cifrado e nunca concedido ao navegador", () => {
    assert.match(migration, /api_key_ciphertext text NOT NULL/);
    assert.match(migration, /api_key_iv text NOT NULL/);
    assert.match(connector, /AES-GCM/);
    assert.match(connector, /ASAAS_CREDENTIALS_ENCRYPTION_KEY/);
    assert.doesNotMatch(migration, /GRANT SELECT ON TABLE public\.asaas_connection_secrets/);
    assert.doesNotMatch(settings, /SERVICE_ROLE|service_role|api_key_ciphertext/);
  });

  test("cada cobrança pertence à organização, cliente e lançamento", () => {
    assert.match(migration, /CREATE TABLE public\.asaas_charges/);
    assert.match(migration, /FOREIGN KEY \(organization_id,transaction_id\)/);
    assert.match(migration, /FOREIGN KEY \(organization_id,client_id\)/);
    assert.match(migration, /asaas_one_open_charge_per_transaction/);
    assert.match(connector, /externalReference:transaction\.id/);
    assert.match(connector, /externalReference:client\.id/);
    assert.match(connector, /connector-recovery-/);
  });

  test("checkout fica hospedado no Asaas sem dados de cartão no FLUXA", () => {
    assert.match(connector, /billingType:"UNDEFINED"/);
    assert.match(connector, /invoice_url/);
    assert.doesNotMatch(migration, /card_number|cvv|security_code|card_token/i);
    assert.match(portal, /O FLUXA não armazena dados do seu/);
  });

  test("webhook é autenticado, idempotente e concilia o financeiro", () => {
    assert.match(webhook, /asaas-access-token/);
    assert.match(webhook, /safeEqual/);
    assert.match(migration, /UNIQUE \(organization_id,event_id\)/);
    assert.match(migration, /ON CONFLICT\(organization_id,event_id\) DO NOTHING/);
    assert.match(migration, /financial_transaction_payments/);
    assert.match(migration, /financial_account_movements/);
    assert.match(migration, /current_balance=new_balance/);
  });

  test("estorno integral é automático e parcial fica fora da primeira versão", () => {
    assert.match(webhook, /PAYMENT_REFUNDED/);
    assert.match(webhook, /PAYMENT_CHARGEBACK_REQUESTED/);
    assert.doesNotMatch(webhook, /PAYMENT_PARTIALLY_REFUNDED/);
    assert.match(migration, /Estorno automático informado pelo Asaas/);
  });

  test("pagamento manual é bloqueado enquanto o link estiver ativo", () => {
    assert.match(migration, /ACTIVE_ASAAS_CHARGE/);
    assert.match(migration, /ASAAS_PAYMENT_MANAGED_AUTOMATICALLY/);
    assert.match(finance, /Cancele primeiro a cobrança ativa no Asaas/);
    assert.match(finance, /conciliados automaticamente pelo Asaas/);
    assert.match(connector, /action==="cancel_charge"/);
  });

  test("empresa gerencia cobranças e cliente acessa somente seu portal", () => {
    assert.match(finance, /Cobranças enviadas aos clientes/);
    assert.match(finance, /Gerar cobrança/);
    assert.match(portal, /value="pagamentos"/);
    assert.match(portal, /Pagar no Asaas/);
    assert.match(migration, /access\.user_id=auth\.uid\(\)/);
    assert.match(migration, /access\.client_id=charge\.client_id/);
  });
});
