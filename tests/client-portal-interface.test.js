import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const detail = readFileSync("src/routes/_authenticated/clientes.$clientId.tsx", "utf8");
const panel = readFileSync("src/components/clients/client-portal-panel.tsx", "utf8");
const hook = readFileSync("src/hooks/use-client-portal.ts", "utf8");
const publicRoute = readFileSync("src/routes/portal-do-cliente.$token.tsx", "utf8");
const frontend = detail + panel + hook + publicRoute;

describe("interface segura do Portal do Cliente", () => {
  test("aba aparece apenas para proprietário e administrador", () => {
    assert.match(detail, /role === "proprietario" \|\| role === "administrador"/);
    assert.match(detail, /canManageClientPortal &&[\s\S]*value="portal"/);
  });

  test("gestão usa somente RPCs administrativas protegidas", () => {
    assert.match(hook, /create_client_portal_invitation/);
    assert.match(hook, /cancel_client_portal_invitation/);
    assert.match(hook, /set_client_portal_access_active/);
    assert.doesNotMatch(hook, /\.insert\(|\.update\(|\.delete\(/);
  });

  test("link público nasce do token opaco e aparece apenas após geração", () => {
    assert.match(hook, /portal-do-cliente\/\$\{encodeURIComponent\(invitation\.token\)\}/);
    assert.match(panel, /Por segurança, o link completo aparece somente agora/);
    assert.doesNotMatch(panel, /token_hash/);
  });

  test("página pública cria conta ou entra antes do aceite", () => {
    assert.match(publicRoute, /auth\.signUp/);
    assert.match(publicRoute, /signIn\(preview\.email, password\)/);
    assert.match(publicRoute, /accept_client_portal_invitation/);
    assert.match(publicRoute, /emailRedirectTo:[\s\S]*portal-do-cliente/);
  });

  test("página pública não consulta módulos internos", () => {
    for (const table of ["processes", "documents", "tasks", "clients", "financial_transactions"]) {
      assert.doesNotMatch(publicRoute, new RegExp(`from\\(["']${table}["']\\)`));
    }
    assert.doesNotMatch(publicRoute, /organization_members/);
  });

  test("frontend não contém credencial privilegiada", () => {
    assert.doesNotMatch(frontend, /service_role|SUPABASE_SERVICE|service key/i);
  });
});
