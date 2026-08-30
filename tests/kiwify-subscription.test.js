import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  buildKiwifyCheckoutUrl,
  canManageSubscription,
  KIWIFY_CHECKOUT_URL,
} from "../src/lib/billing.ts";

describe("assinatura mensal via Kiwify", () => {
  test("usa o checkout público aprovado e identifica a empresa sem expor segredo", () => {
    const url = new URL(
      buildKiwifyCheckoutUrl({
        organizationId: "11111111-1111-4111-8111-111111111111",
        email: "dono+fluxa@example.com",
        name: "Empresa Exemplo",
      }),
    );

    assert.equal(KIWIFY_CHECKOUT_URL, "https://pay.kiwify.com.br/tRg38TD");
    assert.equal(url.searchParams.get("s1"), "11111111-1111-4111-8111-111111111111");
    assert.equal(url.searchParams.get("src"), "fluxa_app");
    assert.equal(url.searchParams.get("email"), "dono+fluxa@example.com");
    assert.equal(url.searchParams.get("token"), null);
  });

  test("somente responsáveis comerciais veem o botão de assinatura", () => {
    for (const role of ["superadmin", "proprietario", "administrador"]) {
      assert.equal(canManageSubscription(role), true);
    }
    for (const role of ["gestor", "operacional", "financeiro", "visualizador", null]) {
      assert.equal(canManageSubscription(role), false);
    }
  });

  test("fundação persiste checkout, exige service role e processa eventos idempotentes", async () => {
    const [migration, webhook, blocked, header, config, generatedTypes] = await Promise.all([
      readFile(
        new URL(
          "../supabase/migrations/20260830180000_kiwify_subscription_foundation.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../supabase/functions/kiwify-webhook/index.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../src/components/commercial-access-blocked.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/layout/app-header.tsx", import.meta.url), "utf8"),
      readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
      readFile(
        new URL("../src/integrations/supabase/types.ts", import.meta.url),
        "utf8",
      ),
    ]);

    assert.match(migration, /CREATE TABLE public\.organization_subscriptions/);
    assert.match(migration, /CREATE TABLE public\.kiwify_webhook_events/);
    assert.match(migration, /ON CONFLICT \(event_key\) DO NOTHING/);
    assert.match(migration, /auth\.role\(\) <> 'service_role'/);
    assert.match(migration, /member\.role IN \('superadmin', 'proprietario', 'administrador'\)/);
    assert.match(webhook, /KIWIFY_WEBHOOK_SECRET/);
    assert.match(webhook, /KIWIFY_PRODUCT_ID/);
    assert.match(webhook, /BILLING_EMAIL_MISMATCH/);
    assert.match(webhook, /TrackingParameters/);
    assert.match(config, /\[functions\.kiwify-webhook\][\s\S]*verify_jwt = false/);
    assert.match(blocked, /Assinar FLUXA/);
    assert.match(header, /commercialStatus === "trial"[\s\S]*Assinar/);
    assert.match(generatedTypes, /kiwify_webhook_events:/);
    assert.match(generatedTypes, /apply_kiwify_subscription_event:/);
  });
});
