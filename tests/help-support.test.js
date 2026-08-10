import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { HELP_ARTICLES, searchHelpArticles } from "../src/lib/help-center.ts";
const sql = readFileSync(
  new URL("../supabase/migrations/20260810180000_help_support_center.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../src/routes/_authenticated/ajuda.tsx", import.meta.url),
  "utf8",
);
const hook = readFileSync(new URL("../src/hooks/use-support-requests.ts", import.meta.url), "utf8");
describe("central de ajuda", () => {
  test("busca por título sem depender de acentos", () =>
    assert.equal(searchHelpArticles("como criar um cliente")[0].id, "primeiro-cliente"));
  test("busca por palavra-chave", () =>
    assert.ok(searchHelpArticles("cobranca").some((a) => a.id === "lancamento")));
  test("filtra por categoria", () =>
    assert.ok(searchHelpArticles("", "Financeiro").every((a) => a.category === "Financeiro")));
  test("mantém conteúdo centralizado e completo", () => {
    assert.ok(HELP_ARTICLES.length >= 45);
    assert.doesNotMatch(route, /const HELP_ARTICLES/);
  });
  test("abre artigo e navega internamente para o módulo", () => {
    assert.match(route, /setSelected\(a\)/);
    assert.match(route, /navigate\(\{to:selected\.relatedRoute/);
    assert.doesNotMatch(route, /target="_blank"/);
  });
  test("exibe estados vazios de busca e solicitações", () => {
    assert.match(route, /Nenhum conteúdo encontrado/);
    assert.match(route, /Você ainda não abriu nenhuma solicitação/);
  });
});
describe("segurança do suporte", () => {
  test("criação usa RPC e não update direto", () => {
    assert.match(hook, /rpc\("create_support_request"/);
    assert.doesNotMatch(hook, /\.update\(/);
  });
  test("criador vê a própria solicitação e administradores veem a organização", () =>
    assert.match(sql, /created_by=auth\.uid\(\) OR public\.has_org_role/));
  test("operacional não administra solicitação alheia", () => {
    const fn = sql.match(/support_assert_admin[\s\S]+?END \$\$/)[0];
    assert.doesNotMatch(fn, /operacional/);
  });
  test("administrador pode alterar status por RPC", () =>
    assert.match(sql, /update_support_request_status[\s\S]+support_assert_admin/));
  test("bloqueia referências e atribuições cross-organization", () => {
    assert.match(sql, /is_org_member\(_organization_id\)/);
    assert.match(sql, /SUPPORT_ASSIGNEE_ORG_MISMATCH/);
  });
  test("PUBLIC e anon não executam RPCs", () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC,anon/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]+TO authenticated/);
  });
  test("RLS está ativa e escrita direta revogada", () => {
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /REVOKE INSERT,UPDATE,DELETE/);
  });
  test("ações relevantes geram auditoria sem descrição no metadata", () => {
    for (const action of ["created", "status_changed", "resolved", "assignee_changed", "archived"])
      assert.match(sql, new RegExp(`support\\.request\\.${action}`));
    assert.doesNotMatch(sql, /jsonb_build_object\([^)]*description/);
  });
  test("não usa Edge Function, service_role ou integração externa", () =>
    assert.doesNotMatch(
      sql + route + hook,
      /service_role|functions\.invoke|http_request|net\.http|zendesk|intercom/i,
    ));
});
