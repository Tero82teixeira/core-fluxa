import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("checklist comercial da jornada do cliente", () => {
  test("documenta a jornada completa sem orientar uma cobrança acidental", async () => {
    const checklist = await readFile(
      new URL("../docs/operations/commercial-customer-journey.md", import.meta.url),
      "utf8",
    );

    for (const stage of [
      "Entrada pública",
      "Cadastro e confirmação",
      "Configuração inicial",
      "Teste grátis e operação",
      "Assinatura",
      "Pagamento controlado",
      "Falhas e recuperação",
      "Critério de liberação",
    ]) {
      assert.match(checklist, new RegExp(stage));
    }

    assert.match(checklist, /14 dias grátis/);
    assert.match(checklist, /R\$ 149,90\/mês/);
    assert.match(checklist, /limite comercial de \*\*5 usuários\*\*/);
    assert.match(checklist, /Encerre aqui o teste rotineiro, sem pagar/);
    assert.match(checklist, /não deve exibir e-mail, CPF, telefone ou payload/);
  });

  test("mantém o checklist alinhado às telas e regras comerciais", async () => {
    const [landing, auth, onboarding, billing, subscription, webhook] = await Promise.all([
      readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/routes/entrar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/routes/_authenticated/onboarding.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/billing.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/routes/_authenticated/assinatura.tsx", import.meta.url), "utf8"),
      readFile(new URL("../supabase/functions/kiwify-webhook/index.ts", import.meta.url), "utf8"),
    ]);

    assert.match(landing, /14 dias grátis/);
    assert.match(landing, /Sem cartão/);
    assert.match(auth, /legalAccepted/);
    assert.match(auth, /needsEmailConfirmation/);
    assert.match(onboarding, /Conclua estas quatro etapas rápidas/);
    assert.doesNotMatch(onboarding, /Concluir depois/);
    assert.match(billing, /FLUXA_MONTHLY_PRICE = 149\.9/);
    assert.match(subscription, /Minha assinatura/);
    assert.match(webhook, /apply_kiwify_subscription_event/);
    assert.match(webhook, /recordFailure/);
  });
});
