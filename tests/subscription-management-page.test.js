import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  canRestartKiwifyCheckout,
  FLUXA_MONTHLY_PRICE,
  FLUXA_PLAN_NAME,
  subscriptionStatusLabel,
} from "../src/lib/billing.ts";

describe("gestão da assinatura da empresa", () => {
  test("expõe o plano comercial real e traduz os estados da Kiwify", () => {
    assert.equal(FLUXA_PLAN_NAME, "FLUXA Essencial Mensal");
    assert.equal(FLUXA_MONTHLY_PRICE, 149.9);
    assert.equal(subscriptionStatusLabel("active"), "Ativa");
    assert.equal(subscriptionStatusLabel("past_due"), "Pagamento pendente");
    assert.equal(subscriptionStatusLabel("canceled"), "Cancelada");
    assert.equal(subscriptionStatusLabel(null), "Ainda não contratada");
  });

  test("só reabre checkout quando não há assinatura ativa", () => {
    assert.equal(canRestartKiwifyCheckout(null), true);
    assert.equal(canRestartKiwifyCheckout("pending"), true);
    assert.equal(canRestartKiwifyCheckout("canceled"), true);
    assert.equal(canRestartKiwifyCheckout("active"), false);
    assert.equal(canRestartKiwifyCheckout("past_due"), false);
  });

  test("página consulta dados reais e orienta o gerenciamento seguro", async () => {
    const [page, hook, sidebar, navigation] = await Promise.all([
      readFile(new URL("../src/routes/_authenticated/assinatura.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/hooks/use-subscription.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/components/layout/app-sidebar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/navigation.ts", import.meta.url), "utf8"),
    ]);

    assert.match(navigation, /Minha assinatura/);
    assert.match(sidebar, /item\.to !== "\/assinatura" \|\| canManageSubscription\(role\)/);
    assert.match(hook, /from\("organization_subscriptions"\)/);
    assert.match(hook, /canReadSubscription/);
    assert.match(page, /FLUXA_PLAN_NAME/);
    assert.match(page, /next_payment_at/);
    assert.match(page, /access_until/);
    assert.match(page, /billing_email/);
    assert.match(page, /Gerenciar assinatura/);
    assert.doesNotMatch(page, /dashboard\.kiwify|service_role/);
  });

  test("banco restringe detalhes de cobrança aos gestores comerciais", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260901120000_subscription_manager_visibility.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(migration, /DROP POLICY IF EXISTS organization_subscriptions_read/);
    assert.match(migration, /has_org_role/);
    assert.match(migration, /'superadmin', 'proprietario', 'administrador'/);
    assert.match(migration, /is_platform_admin/);
    assert.doesNotMatch(migration, /GRANT (INSERT|UPDATE|DELETE)/);
  });
});
