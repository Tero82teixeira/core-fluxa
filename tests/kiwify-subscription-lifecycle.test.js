import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260831150000_kiwify_subscription_lifecycle.sql",
  import.meta.url,
);

describe("ciclo de vida da assinatura Kiwify", () => {
  test("persiste período pago e o webhook encaminha as datas reais", async () => {
    const [migration, webhook, types] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(new URL("../supabase/functions/kiwify-webhook/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/integrations/supabase/types.ts", import.meta.url), "utf8"),
    ]);

    assert.match(migration, /ADD COLUMN access_until timestamptz/);
    assert.match(migration, /ADD COLUMN next_payment_at timestamptz/);
    assert.match(webhook, /customerAccess\.access_until/);
    assert.match(webhook, /subscription\.next_payment/);
    assert.match(webhook, /_access_until: accessUntil/);
    assert.match(webhook, /_next_payment_at: nextPaymentAt/);
    assert.match(types, /access_until: string \| null/);
    assert.match(types, /next_payment_at: string \| null/);
  });

  test("cancelamento preserva acesso pago e reembolso bloqueia imediatamente", async () => {
    const migration = await readFile(migrationPath, "utf8");

    assert.match(
      migration,
      /_subscription_status = 'canceled'[\s\S]*effective_access_until > _event_at/,
    );
    assert.match(
      migration,
      /_subscription_status IN \('refunded', 'chargeback'\)[\s\S]*effective_access_until := _event_at/,
    );
    assert.match(
      migration,
      /ELSIF _subscription_status IN \('canceled', 'refunded', 'chargeback'\)[\s\S]*commercial_status = 'suspended'/,
    );
  });

  test("atraso recebe cinco dias e expira pelo relógio privado existente", async () => {
    const migration = await readFile(migrationPath, "utf8");

    assert.match(migration, /_subscription_status = 'past_due'/);
    assert.match(migration, /_event_at \+ interval '5 days'/);
    assert.match(migration, /CREATE FUNCTION public\.suspend_expired_kiwify_subscriptions/);
    assert.match(migration, /status IN \('pending', 'past_due', 'canceled'\)/);
    assert.match(migration, /FOR UPDATE OF subscription SKIP LOCKED/);
    assert.match(migration, /GRANT EXECUTE[\s\S]*TO postgres/);
    assert.match(
      migration,
      /kiwify_expiry_count :=[\s\S]*public\.suspend_expired_kiwify_subscriptions\(\)/,
    );
    assert.doesNotMatch(migration, /cron\.schedule/);
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
  });
});
