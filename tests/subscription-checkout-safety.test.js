import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import { canRestartKiwifyCheckout } from "../src/lib/billing.ts";

const NOW = new Date("2026-09-01T12:00:00.000Z");

describe("proteção do reinício do checkout", () => {
  test("permite somente estados sem acesso pago vigente", () => {
    assert.equal(canRestartKiwifyCheckout(null, null, NOW), true);
    assert.equal(canRestartKiwifyCheckout("pending", null, NOW), true);
    assert.equal(canRestartKiwifyCheckout("refunded", null, NOW), true);
    assert.equal(canRestartKiwifyCheckout("chargeback", null, NOW), true);
    assert.equal(canRestartKiwifyCheckout("active", "2026-10-01T12:00:00.000Z", NOW), false);
  });

  test("protege carência e período cancelado já pago até o vencimento", () => {
    for (const status of ["past_due", "canceled"]) {
      assert.equal(canRestartKiwifyCheckout(status, "2026-09-02T12:00:00.000Z", NOW), false);
      assert.equal(canRestartKiwifyCheckout(status, "2026-09-01T12:00:00.000Z", NOW), true);
      assert.equal(canRestartKiwifyCheckout(status, "2026-08-31T12:00:00.000Z", NOW), true);
    }
    assert.equal(canRestartKiwifyCheckout("past_due", null, NOW), false);
    assert.equal(canRestartKiwifyCheckout("canceled", null, NOW), true);
  });

  test("backend bloqueia sobrescrita, duplicidade e disputa entre gestores", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260901200000_secure_subscription_checkout_restart.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(migration, /existing_status = 'active'[\s\S]*SUBSCRIPTION_ALREADY_ACTIVE/);
    assert.match(
      migration,
      /existing_status = 'past_due'[\s\S]*existing_access_until IS NULL[\s\S]*existing_status = 'canceled'[\s\S]*existing_access_until > now\(\)[\s\S]*CHECKOUT_PAID_ACCESS_STILL_ACTIVE/,
    );
    assert.match(
      migration,
      /existing_status = 'pending'[\s\S]*existing_email[\s\S]*interval '30 minutes'[\s\S]*CHECKOUT_ALREADY_IN_PROGRESS/,
    );
    assert.match(migration, /status = 'pending'/);
    assert.doesNotMatch(migration, /WHEN public\.organization_subscriptions\.status = 'active'/);
  });

  test("todos os pontos de entrada consultam o estado antes de abrir a Kiwify", async () => {
    const [hook, page, blocked, header] = await Promise.all([
      readFile(new URL("../src/hooks/use-subscription-checkout.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/routes/_authenticated/assinatura.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/commercial-access-blocked.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/layout/app-header.tsx", import.meta.url), "utf8"),
    ]);

    assert.match(hook, /useOrganizationSubscription/);
    assert.match(hook, /canRestartKiwifyCheckout/);
    assert.match(hook, /if \(!organizationId \|\| !canSubscribe \|\| loading\) return/);
    assert.match(page, /canRestartKiwifyCheckout\(status, subscription\?\.access_until/);
    assert.match(blocked, /subscription\.canSubscribe/);
    assert.match(header, /subscription\.canSubscribe/);
  });
});
