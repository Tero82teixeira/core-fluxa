import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260905230000_client_portal_notifications.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-client-portal-notifications.ts", "utf8");
const communicationHook = readFileSync(
  "src/hooks/use-client-portal-communication.ts",
  "utf8",
);
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

  test("cada aviso abre e destaca o conteúdo autorizado correspondente", () => {
    assert.match(portal, /function openNotification/);
    assert.match(portal, /notificationDestination\(entityType\)/);
    assert.match(portal, /setSelectedCommunicationId\(entityId\)/);
    assert.match(portal, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
    assert.match(portal, /ring-2 ring-primary ring-offset-2/);
    assert.match(portal, /Abrir <ArrowRight/);
  });

  test("portal recebe acabamento visual responsivo e hierarquia moderna", () => {
    assert.match(portal, /bg-gradient-to-b from-primary\/5 via-muted\/30 to-background/);
    assert.match(portal, /sticky top-0 z-40[\s\S]*backdrop-blur-xl/);
    assert.match(portal, /rounded-3xl[\s\S]*bg-gradient-to-br from-primary\/15/);
    assert.match(portal, /PORTAL_TAB_CLASS/);
    assert.match(portal, /data-\[state=active\]:bg-primary/);
    assert.match(portal, /hover:-translate-y-1 hover:shadow-xl/);
  });

  test("atendimento flutuante permite conversar sem trocar de aba", () => {
    assert.match(portal, /aria-label="Falar com a empresa"/);
    assert.match(portal, /fixed right-4 bottom-5/);
    assert.match(portal, /<PopoverContent/);
    assert.match(portal, /function createQuickConversation/);
    assert.match(portal, /function sendQuickReply/);
    assert.match(portal, /Canal protegido do seu portal/);
    assert.match(portal, /Nova conversa/);
    assert.match(portal, /Digite sua mensagem/);
    assert.match(communicationHook, /refetchInterval: 15_000/);
  });

  test("tipos gerados incluem a tabela e os contratos do banco", () => {
    assert.match(types, /client_portal_notifications: \{/);
    assert.match(types, /enqueue_client_portal_notification: \{/);
    assert.match(types, /mark_client_portal_notification_read: \{/);
    assert.match(types, /mark_all_client_portal_notifications_read: \{/);
  });
});
