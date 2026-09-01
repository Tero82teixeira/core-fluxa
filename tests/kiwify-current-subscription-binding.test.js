import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260901210000_bind_kiwify_events_to_current_subscription.sql",
  import.meta.url,
);

describe("vínculo dos eventos ao contrato Kiwify atual", () => {
  test("checkout pendente aceita somente a aprovação de uma nova assinatura", async () => {
    const migration = await readFile(migrationPath, "utf8");

    assert.match(migration, /current_status = 'pending'/);
    assert.match(migration, /_subscription_status <> 'active'/);
    assert.match(migration, /_provider_subscription_id IS NULL/);
    assert.match(migration, /_provider_subscription_id = current_provider_subscription_id/);
    assert.match(migration, /PENDING_CHECKOUT_EVENT_IGNORED/);
  });

  test("contrato ativo ignora evento que pertence a outro identificador", async () => {
    const migration = await readFile(migrationPath, "utf8");

    assert.match(migration, /current_status <> 'pending'/);
    assert.match(migration, /_provider_subscription_id <> current_provider_subscription_id/);
    assert.match(migration, /SUBSCRIPTION_ID_MISMATCH_IGNORED/);
    assert.match(migration, /processing_error = 'SUBSCRIPTION_ID_MISMATCH_IGNORED'/);
  });

  test("mantém carência, cancelamento pago, reembolso imediato e privilégio mínimo", async () => {
    const migration = await readFile(migrationPath, "utf8");

    assert.match(migration, /_event_at \+ interval '5 days'/);
    assert.match(
      migration,
      /_subscription_status = 'canceled'[\s\S]*effective_access_until > _event_at/,
    );
    assert.match(
      migration,
      /_subscription_status IN \('refunded', 'chargeback'\)[\s\S]*effective_access_until := _event_at/,
    );
    assert.match(migration, /auth\.role\(\) <> 'service_role'/);
    assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
  });
});
