import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  matchesPlatformSubscriptionFilter,
  platformBillingMetrics,
} from "../src/lib/platform-billing.ts";

describe("painel comercial de assinaturas", () => {
  test("calcula assinaturas ativas, receita mensal e empresas que exigem atenção", () => {
    const metrics = platformBillingMetrics(
      [
        { organization_id: "active", effective_status: "active" },
        { organization_id: "late", effective_status: "active" },
        { organization_id: "suspended", effective_status: "suspended" },
      ],
      [
        { organization_id: "active", status: "active" },
        { organization_id: "late", status: "past_due" },
        { organization_id: "suspended", status: "canceled" },
      ],
    );

    assert.deepEqual(metrics, {
      activeSubscriptions: 1,
      attentionOrganizations: 2,
      monthlyRecurringRevenue: 149.9,
    });
  });

  test("filtra estados da Kiwify sem confundir checkout não iniciado", () => {
    assert.equal(matchesPlatformSubscriptionFilter(null, "not_started"), true);
    assert.equal(matchesPlatformSubscriptionFilter("pending", "pending"), true);
    assert.equal(matchesPlatformSubscriptionFilter("active", "active"), true);
    assert.equal(matchesPlatformSubscriptionFilter("past_due", "attention"), true);
    assert.equal(matchesPlatformSubscriptionFilter("canceled", "attention"), true);
    assert.equal(matchesPlatformSubscriptionFilter(null, "attention", "expired"), true);
    assert.equal(matchesPlatformSubscriptionFilter("active", "attention"), false);
    assert.equal(matchesPlatformSubscriptionFilter(null, "all"), true);
  });

  test("administração consulta apenas os dados necessários e apresenta o painel", async () => {
    const route = await readFile(
      new URL("../src/routes/_authenticated/administracao-plataforma.tsx", import.meta.url),
      "utf8",
    );

    assert.match(route, /from\("organization_subscriptions"\)/);
    assert.match(route, /platformAdmin/);
    assert.match(route, /Assinaturas ativas/);
    assert.match(route, /Receita mensal contratada/);
    assert.match(route, /Atenção comercial/);
    assert.match(route, /Filtrar por assinatura/);
    assert.match(route, /subscriptionStatusLabel/);
    assert.match(route, /next_payment_at/);
    assert.match(route, /billing_email/);
    assert.doesNotMatch(route, /service_role|kiwify_webhook_events/);
  });
});
