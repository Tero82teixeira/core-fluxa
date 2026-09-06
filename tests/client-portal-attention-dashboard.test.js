import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");

describe("painel de atenção do Meu Portal", () => {
  test("destaca ações prioritárias e confirma quando está tudo em dia", () => {
    assert.match(portal, /Atenção agora/);
    assert.match(portal, /Tudo em dia/);
    assert.match(portal, /itens prioritários para você/);
    assert.match(portal, /Nenhuma ação urgente ou mensagem não lida/);
  });

  test("prioriza correções e prazos vencidos antes dos demais itens", () => {
    assert.match(portal, /request\.status === "revision_requested" \? 0 : overdue \? 1 : 2/);
    assert.match(portal, /priority: 3/);
    assert.match(portal, /left\.priority - right\.priority/);
    assert.match(portal, /\.slice\(0, 5\)/);
  });

  test("não repete notificações não lidas da mesma conversa", () => {
    assert.match(portal, /const seenThreads = new Set<string>\(\)/);
    assert.match(portal, /seenThreads\.has\(notification\.entity_id\)/);
    assert.match(portal, /seenThreads\.add\(notification\.entity_id\)/);
  });

  test("leva o cliente diretamente ao item selecionado", () => {
    assert.match(portal, /focusPortalEntity\(item\.entityType, item\.entityId\)/);
    assert.match(portal, /setActiveTab\("processos"\)/);
    assert.match(portal, /setQuickChatOpen\(true\)/);
  });

  test("usa a data civil brasileira e dados já projetados no portal", () => {
    assert.match(portal, /const today = civilDateKey\(\)/);
    assert.match(portal, /requests\.data/);
    assert.match(portal, /notifications\.data/);
    assert.doesNotMatch(portal, /from\(["']client_portal_document_requests["']\)/);
  });
});
