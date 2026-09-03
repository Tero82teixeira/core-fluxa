import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260903120000_client_portal_session_shell.sql",
  "utf8",
);
const databaseTest = readFileSync(
  "supabase/tests/database/059_client_portal_session_shell.sql",
  "utf8",
);
const login = readFileSync("src/routes/entrar.tsx", "utf8");
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");
const invitation = readFileSync("src/routes/portal-do-cliente.$token.tsx", "utf8");

describe("sessão isolada do Portal do Cliente", () => {
  test("resolve o destino no banco sem aceitar organização ou cliente do navegador", () => {
    assert.match(migration, /FUNCTION public\.resolve_authenticated_home\(\)/);
    assert.match(migration, /member\.user_id = v_uid/);
    assert.match(migration, /access\.user_id = v_uid/);
    assert.doesNotMatch(migration, /resolve_authenticated_home\([^)]*(?:uuid|text)/);
  });

  test("sessão retorna somente identidade mínima do próprio acesso", () => {
    assert.match(migration, /FUNCTION public\.client_portal_session\(\)/);
    assert.match(migration, /WHERE access\.user_id = auth\.uid\(\)/);
    assert.doesNotMatch(
      migration,
      /RETURNS TABLE\([\s\S]*?(?:process|document|task|financial|notes)/i,
    );
  });

  test("RPCs são exclusivas de usuários autenticados", () => {
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.resolve_authenticated_home\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.client_portal_session\(\)[\s\S]*TO authenticated/,
    );
  });

  test("login separa cliente externo do workspace interno", () => {
    assert.match(login, /resolve_authenticated_home/);
    assert.match(login, /data === "client_portal" \? "\/meu-portal" : "\/central"/);
    assert.doesNotMatch(login, /navigate\(\{ to: "\/central"[\s\S]*await signIn/);
  });

  test("Meu Portal exige autenticação e usa somente a RPC isolada", () => {
    assert.match(portal, /beforeLoad:[\s\S]*supabase\.auth\.getUser/);
    assert.match(portal, /useClientPortalSession/);
    assert.doesNotMatch(
      portal,
      /\.from\(["'](?:clients|processes|documents|tasks|financial_transactions)["']\)/,
    );
  });

  test("aceite oferece entrada direta no portal", () => {
    assert.match(invitation, /to="\/meu-portal"[\s\S]*Acessar Meu Portal/);
  });

  test("banco cobre isolamento, acesso desativado e prioridade interna", () => {
    for (const required of [
      "only the caller access",
      "does not grant direct process table access",
      "disabled access",
      "internal membership remains the primary destination",
      "pending portal invitation",
    ]) {
      assert.match(databaseTest, new RegExp(required, "i"));
    }
  });
});
