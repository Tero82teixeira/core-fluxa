import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260905200000_client_portal_communication.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-client-portal-communication.ts", "utf8");
const management = readFileSync("src/components/clients/client-portal-panel.tsx", "utf8");
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");

describe("comunicação segura no Meu Portal", () => {
  test("tabela de compartilhamento não é uma API direta do navegador", () => {
    assert.match(
      migration,
      /ALTER TABLE public\.client_portal_communication_shares ENABLE ROW LEVEL SECURITY/,
    );
    assert.match(
      migration,
      /REVOKE ALL ON TABLE public\.client_portal_communication_shares\s+FROM PUBLIC, anon, authenticated/,
    );
  });

  test("somente proprietário e administrador liberam conversas existentes", () => {
    assert.match(
      migration,
      /set_client_portal_communication_shared[\s\S]*ARRAY\['proprietario','administrador'\]/,
    );
    assert.match(management, /Conversas visíveis no portal/);
    assert.match(management, /Notas internas nunca aparecem/);
  });

  test("projeção do portal exige acesso ativo e compartilhamento explícito", () => {
    for (const name of [
      "client_portal_communication_threads",
      "client_portal_communication_entries",
    ]) {
      const start = migration.indexOf("FUNCTION public." + name);
      assert.notEqual(start, -1);
      const body = migration.slice(start, start + 4200);
      assert.match(body, /access\.user_id = auth\.uid\(\)/);
      assert.match(body, /access\.is_active/);
      assert.match(body, /share\.is_shared/);
    }
  });

  test("notas internas, status e outros tipos nunca saem para o cliente", () => {
    const start = migration.indexOf(
      "FUNCTION public.client_portal_communication_entries",
    );
    const body = migration.slice(start, start + 2600);
    assert.match(body, /entry\.entry_type = 'mensagem'/);
    assert.match(body, /NOT entry\.is_internal/);
    assert.doesNotMatch(body, /entry\.metadata\s*,/);
  });

  test("cliente cria e responde somente por RPCs limitadas", () => {
    assert.match(hook, /create_client_portal_communication_thread/);
    assert.match(hook, /add_client_portal_communication_entry/);
    assert.doesNotMatch(
      hook,
      /\.from\(["'](?:communication_threads|communication_entries)["']\)/,
    );
    assert.match(
      migration,
      /char_length\(btrim\(COALESCE\(_content, ''\)\)\) NOT BETWEEN 1 AND 5000/,
    );
  });

  test("mensagem do cliente entra na central aguardando a equipe", () => {
    assert.match(migration, /'aguardando_equipe', 'normal', auth\.uid\(\)/);
    assert.match(
      migration,
      /jsonb_build_object\('source', 'client_portal', 'author_kind', 'client'\)/,
    );
    assert.match(migration, /SET status = 'aguardando_equipe'/);
  });

  test("aba Comunicação está ativa com criação, timeline e resposta", () => {
    assert.match(portal, /TabsTrigger value="comunicacao"/);
    assert.doesNotMatch(portal, /TabsTrigger value="comunicacao"[^>]*disabled/);
    assert.match(portal, /Iniciar conversa/);
    assert.match(portal, /Minhas conversas/);
    assert.match(portal, /Enviar mensagem/);
  });
});
