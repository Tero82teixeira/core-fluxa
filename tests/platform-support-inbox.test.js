import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260901230000_platform_support_inbox.sql", import.meta.url),
  "utf8",
);
const databaseTest = readFileSync(
  new URL("../supabase/tests/database/055_platform_support_inbox.sql", import.meta.url),
  "utf8",
);
const platformRoute = readFileSync(
  new URL("../src/routes/_authenticated/suporte-plataforma.tsx", import.meta.url),
  "utf8",
);
const customerRoute = readFileSync(
  new URL("../src/routes/_authenticated/ajuda.tsx", import.meta.url),
  "utf8",
);
const supportHook = readFileSync(
  new URL("../src/hooks/use-support-requests.ts", import.meta.url),
  "utf8",
);
const platformHook = readFileSync(
  new URL("../src/hooks/use-platform-support.ts", import.meta.url),
  "utf8",
);
const appHeader = readFileSync(
  new URL("../src/components/layout/app-header.tsx", import.meta.url),
  "utf8",
);
const authenticatedLayout = readFileSync(
  new URL("../src/routes/_authenticated.tsx", import.meta.url),
  "utf8",
);

describe("central de suporte da plataforma", () => {
  test("somente o administrador da plataforma recebe a visão global", () => {
    assert.match(migration, /platform_support_requests[\s\S]+is_platform_admin\(\)/);
    assert.match(platformRoute, /if \(!platformAdmin\)/);
    assert.match(platformRoute, /Somente a administração da plataforma FLUXA/);
    assert.match(
      databaseTest,
      /ordinary organization owners cannot open the platform support inbox/,
    );
  });

  test("mensagens não ficam disponíveis por acesso direto do navegador", () => {
    assert.match(migration, /support_request_messages ENABLE ROW LEVEL SECURITY/);
    assert.match(
      migration,
      /REVOKE ALL ON TABLE public\.support_request_messages[\s\S]+PUBLIC, anon, authenticated/,
    );
    assert.match(databaseTest, /browser sessions have no direct access to support messages/);
  });

  test("cliente e plataforma conversam pelo fluxo seguro", () => {
    assert.match(supportHook, /rpc\("support_request_thread"/);
    assert.match(supportHook, /rpc\("reply_support_request"/);
    assert.match(customerRoute, /Ver atendimento/);
    assert.match(customerRoute, /entry\.author_kind === "platform"/);
    assert.match(migration, /THEN 'Equipe FLUXA'/);
    assert.match(platformRoute, /Resposta enviada ao cliente/);
    assert.match(migration, /SUPPORT_REQUEST_ACCESS_DENIED/);
  });

  test("link da notificação abre automaticamente o atendimento correto", () => {
    assert.match(customerRoute, /validateSearch:[\s\S]*search\.chamado/);
    assert.match(customerRoute, /request\.id === requestedRequestId/);
    assert.match(customerRoute, /setSelectedRequest\(requested\)/);
    assert.match(customerRoute, /navigate\(\{ to: "\/ajuda", search: \{\}, replace: true \}\)/);
  });

  test("resposta da plataforma notifica o solicitante sem registrar a mensagem na auditoria", () => {
    assert.match(migration, /Nova resposta do suporte FLUXA/);
    assert.match(migration, /'support-reply:' \|\| response_id::text/);
    assert.match(migration, /support\.request\.platform_replied/);
    assert.doesNotMatch(migration, /jsonb_build_object\([^)]*message/);
  });

  test("menu mostra chamados pendentes e libera a área apesar do bloqueio comercial", () => {
    assert.match(appHeader, /Central de suporte/);
    assert.match(appHeader, /platformSupport\.data/);
    assert.match(platformHook, /refetchInterval: 60_000/);
    assert.equal(authenticatedLayout.match(/suporte-plataforma/g)?.length, 2);
  });

  test("painel oferece busca, filtros, indicadores e resposta com próximo status", () => {
    for (const label of ["Novas", "Em análise", "Aguardando cliente", "Resolvidas"]) {
      assert.match(platformRoute, new RegExp(label));
    }
    assert.match(platformRoute, /Buscar empresa, cliente ou assunto/);
    assert.match(platformRoute, /Filtrar por status/);
    assert.match(platformRoute, /Filtrar por prioridade/);
    assert.match(platformRoute, /nextStatus/);
  });
});
