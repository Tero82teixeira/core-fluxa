import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  kiwifyDiagnosticLabel,
  kiwifyEventHealthSummary,
  kiwifyEventTypeLabel,
} from "../src/lib/kiwify-health.ts";

describe("saúde dos pagamentos Kiwify", () => {
  test("resume eventos processados, ignorados e que exigem atenção", () => {
    assert.deepEqual(
      kiwifyEventHealthSummary([
        { outcome: "processed" },
        { outcome: "processed" },
        { outcome: "ignored" },
        { outcome: "attention" },
      ]),
      { processed: 2, ignored: 1, attention: 1 },
    );
  });

  test("traduz eventos e diagnósticos técnicos para o administrador", () => {
    assert.equal(kiwifyEventTypeLabel("order_approved"), "Compra aprovada");
    assert.equal(kiwifyEventTypeLabel("subscription_late"), "Pagamento atrasado");
    assert.equal(
      kiwifyDiagnosticLabel("SUBSCRIPTION_ID_MISMATCH_IGNORED"),
      "Evento de uma assinatura anterior",
    );
    assert.equal(kiwifyDiagnosticLabel(null), null);
  });

  test("RPC revela somente referências operacionais para administradores da plataforma", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260901220000_platform_kiwify_event_health.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.platform_kiwify_event_health/);
    assert.match(migration, /IF NOT public\.is_platform_admin\(\)/);
    assert.match(migration, /PLATFORM_ADMIN_REQUIRED/);
    assert.match(migration, /LIMIT _limit/);
    assert.match(migration, /right\(event\.processing_error, 8\) = '_IGNORED'/);
    assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, service_role/);
    assert.doesNotMatch(migration, /Customer|customer_email|mobile|CPF|cnpj|raw_payload/i);
  });

  test("painel apresenta indicadores, atualização e estados de carregamento", async () => {
    const [route, generatedTypes] = await Promise.all([
      readFile(
        new URL("../src/routes/_authenticated/administracao-plataforma.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../src/integrations/supabase/types.ts", import.meta.url), "utf8"),
    ]);

    assert.match(route, /Saúde dos pagamentos Kiwify/);
    assert.match(route, /platform_kiwify_event_health/);
    assert.match(route, /Ignorado com segurança/);
    assert.match(route, /Precisa de atenção/);
    assert.match(route, /query\.refetch\(\)/);
    assert.match(route, /Nenhum evento de pagamento foi recebido ainda/);
    assert.doesNotMatch(route, /kiwify_webhook_events|service_role/);
    assert.match(generatedTypes, /platform_kiwify_event_health:/);
  });
});
