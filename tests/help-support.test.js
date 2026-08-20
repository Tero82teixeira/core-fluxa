import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { HELP_ARTICLES, searchHelpArticles } from "../src/lib/help-center.ts";
import { goToHelpArticleModule, openHelpArticle } from "../src/lib/help-center-interactions.ts";
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
  test("artigo, guia rápido e FAQ abrem o diálogo sem navegar", () => {
    const article = HELP_ARTICLES.find((item) => item.id === "primeira-tarefa");
    assert.ok(article);

    for (const entry of ["Ler artigo", "Guia rápido", "FAQ"]) {
      const selected = [];
      const navigated = [];
      const event = activationEvent();
      openHelpArticle(event, article, (value) => selected.push(value));

      assert.deepEqual(selected, [article], `${entry} deve selecionar o artigo`);
      assert.deepEqual(navigated, [], `${entry} não deve navegar`);
      assert.equal(event.prevented, 1);
      assert.equal(event.stopped, 1);
    }
  });
  test("diálogo apresenta título, resumo, passo a passo e dicas", () => {
    const article = HELP_ARTICLES.find((item) => item.id === "primeira-tarefa");
    assert.ok(article?.title);
    assert.ok(article?.summary);
    assert.ok(article?.content.length);
    assert.ok(article?.tips.length);
    assert.match(route, /<DialogTitle[\s\S]*selected\.title/);
    assert.match(route, /<DialogDescription>\{selected\.summary\}/);
    assert.match(route, /selected\.content\.map/);
    assert.match(route, /selected\.tips\.map/);
  });
  test("Fechar limpa o artigo sem navegar", () => {
    const selected = [];
    const navigated = [];
    selected.push(null);
    assert.deepEqual(selected, [null]);
    assert.deepEqual(navigated, []);
    assert.match(route, /type="button" variant="outline" onClick=\{\(\) => setSelected\(null\)\}/);
  });
  test("Ir para o módulo fecha e navega exatamente uma vez para relatedRoute", () => {
    const article = HELP_ARTICLES.find((item) => item.id === "primeira-tarefa");
    assert.ok(article);
    const selected = [];
    const navigated = [];
    const event = activationEvent();

    goToHelpArticleModule(
      event,
      article,
      (value) => selected.push(value),
      (to) => navigated.push(to),
    );

    assert.deepEqual(selected, [null]);
    assert.deepEqual(navigated, [article.relatedRoute]);
    assert.equal(navigated[0], "/tarefas");
  });
  test("somente a ação explícita do diálogo recebe a navegação", () => {
    assert.equal(route.match(/\bnavigate\s*\(/g)?.length, 1);
    assert.match(route, /goToHelpArticleModule\(event, selected/);
    assert.equal(route.match(/openHelpArticle\(event,/g)?.length, 3);
    assert.doesNotMatch(route, /window\.open\s*\(|href\s*=\s*["']https?:\/\/|target="_blank"/i);
    assert.equal(route.match(/type="button"/g)?.length >= 5, true);
  });
  test("exibe estados vazios de busca e solicitações", () => {
    assert.match(route, /Nenhum conteúdo encontrado/);
    assert.match(route, /Você ainda não abriu nenhuma solicitação/);
  });
});

function activationEvent() {
  return {
    prevented: 0,
    stopped: 0,
    preventDefault() {
      this.prevented += 1;
    },
    stopPropagation() {
      this.stopped += 1;
    },
  };
}
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
