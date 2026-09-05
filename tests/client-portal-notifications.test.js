import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260905230000_client_portal_notifications.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-client-portal-notifications.ts", "utf8");
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("notificações seguras no Meu Portal", () => {
  test("notificações internas e notificações do portal permanecem isoladas", () => {
    assert.match(migration, /CREATE TABLE public\.client_portal_notifications/);
    assert.match(
      migration,
      /REVOKE ALL ON TABLE public\.client_portal_notifications FROM PUBLIC, anon, authenticated/,
    );
    assert.doesNotMatch(hook, /\.from\(["']notifications["']\)/);
    assert.doesNotMatch(hook, /\.from\(["']client_portal_notifications["']\)/);
  });

  test("projeção deriva a identidade e exige acesso ativo", () => {
    const start = migration.indexOf("FUNCTION public.client_portal_notifications");
    const body = migration.slice(start, start + 5000);
    assert.match(body, /access\.user_id = auth\.uid\(\)/);
    assert.match(body, /access\.is_active/);
    assert.match(body, /client\.archived_at IS NULL/);
  });

  test("avisos de itens revogados deixam de ser projetados", () => {
    const start = migration.indexOf("FUNCTION public.client_portal_notifications");
    const body = migration.slice(start, start + 5000);
    assert.match(body, /client_portal_process_shares[\s\S]*share\.is_shared/);
    assert.match(body, /client_portal_document_shares[\s\S]*share\.is_shared/);
    assert.match(body, /client_portal_communication_shares[\s\S]*share\.is_shared/);
  });

  test("somente eventos autorizados geram notificações para o cliente", () => {
    assert.match(migration, /client_portal_process_share_notify/);
    assert.match(migration, /client_portal_document_share_notify/);
    assert.match(migration, /client_portal_document_request_notify/);
    assert.match(migration, /client_portal_company_message_notify/);
    assert.match(migration, /NEW\.entry_type <> 'mensagem' OR NEW\.is_internal/);
    assert.match(migration, /metadata->>'source'.*= 'client_portal'/);
  });

  test("resposta pública da empresa atualiza a espera para o cliente", () => {
    assert.match(
      migration,
      /notify_client_portal_company_message[\s\S]*SET status = 'aguardando_cliente'/,
    );
  });

  test("leitura é feita apenas por RPCs vinculadas à conta autenticada", () => {
    assert.match(hook, /mark_client_portal_notification_read/);
    assert.match(hook, /mark_all_client_portal_notifications_read/);
    assert.match(
      migration,
      /mark_client_portal_notification_read[\s\S]*access\.user_id = auth\.uid\(\)[\s\S]*access\.is_active/,
    );
  });

  test("aba Notificações está ativa com contador e controles de leitura", () => {
    assert.match(portal, /TabsTrigger value="notificacoes"/);
    assert.doesNotMatch(portal, /TabsTrigger value="notificacoes"[^>]*disabled/);
    assert.match(portal, /Notificações não lidas/);
    assert.match(portal, /Marcar todas como lidas/);
    assert.match(portal, /Marcar como lida/);
  });

  test("tipos gerados incluem a tabela e os três contratos públicos", () => {
    assert.match(types, /client_portal_notifications: \{/);
    assert.match(types, /mark_client_portal_notification_read: \{/);
    assert.match(types, /mark_all_client_portal_notifications_read: \{/);
  });
});
