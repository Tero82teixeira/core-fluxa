import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260906120000_staff_client_portal_inbox.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-staff-portal-inbox.ts", "utf8");
const component = readFileSync("src/components/layout/staff-quick-chat.tsx", "utf8");
const layout = readFileSync("src/routes/_authenticated.tsx", "utf8");
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const notificationHook = readFileSync(
  "src/hooks/use-client-portal-notifications.ts",
  "utf8",
);

describe("atendimento rápido do Meu Portal para a equipe", () => {
  test("caixa de entrada respeita a permissão interna de Comunicação", () => {
    assert.match(migration, /PERFORM public\.communication_assert_role\(_organization_id, false\)/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.staff_client_portal_inbox\(uuid\)/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.staff_client_portal_inbox\(uuid\) TO authenticated/);
    assert.match(component, /canWriteCommunication\(role\)/);
  });

  test("somente conversas explicitamente compartilhadas entram na caixa rápida", () => {
    assert.match(migration, /client_portal_communication_shares/);
    assert.match(migration, /share\.is_shared/);
    assert.match(migration, /thread\.archived_at IS NULL/);
    assert.match(migration, /entry\.entry_type = 'mensagem'/);
    assert.match(migration, /NOT entry\.is_internal/);
  });

  test("resposta rápida é pública e usa a RPC interna existente", () => {
    assert.match(component, /useAddCommunicationEntry/);
    assert.match(component, /type: "mensagem"/);
    assert.match(component, /internal: false/);
    assert.match(component, /metadata: \{ source: "staff_quick_chat" \}/);
    assert.doesNotMatch(component, /\.from\(["']communication_entries["']\)/);
  });

  test("botão global aparece no layout e atualiza os atendimentos", () => {
    assert.match(layout, /<StaffQuickChat \/>/);
    assert.match(component, /aria-label="Atendimento do Meu Portal"/);
    assert.match(component, /Atender clientes/);
    assert.match(hook, /refetchInterval: 15_000/);
  });

  test("início do cliente reúne prioridades, mensagens, atividades e atalhos", () => {
    assert.match(portal, /Atenção agora/);
    assert.match(portal, /portalAttentionItems/);
    assert.match(portal, /Próximos prazos/);
    assert.match(portal, /Últimas mensagens/);
    assert.match(portal, /Atividade recente/);
    assert.match(portal, /setQuickChatOpen\(true\)/);
  });

  test("tipos gerados incluem a caixa de entrada da equipe", () => {
    assert.match(types, /staff_client_portal_inbox: \{/);
  });

  test("os dois chats abrem na mensagem mais recente", () => {
    assert.match(component, /timelineRef\.current\.scrollTop = timelineRef\.current\.scrollHeight/);
    assert.match(portal, /communicationTimelineRef/);
    assert.match(portal, /quickChatTimelineRef/);
    assert.match(portal, /timeline\.scrollTop = timeline\.scrollHeight/);
  });

  test("abrir uma conversa baixa apenas os avisos de mensagem daquele atendimento", () => {
    assert.match(notificationHook, /useMarkClientPortalNotificationsRead/);
    assert.match(portal, /quickChatOpen \|\| activeTab === "comunicacao"/);
    assert.match(portal, /notification\.kind === "communication"/);
    assert.match(portal, /notification\.entity_id === selectedCommunicationId/);
    assert.match(portal, /markConversationNotificationsRead\.mutateAsync\(notificationIds\)/);
    assert.match(portal, /unreadMessages > 99 \? "99\+" : unreadMessages/);
  });
});
