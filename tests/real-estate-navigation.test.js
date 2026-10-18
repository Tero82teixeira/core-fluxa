import assert from "node:assert/strict";
import test from "node:test";
import { NAV_ITEMS, navItemVisibleForRole, realEstateNavigation } from "../src/lib/navigation.ts";
import { routeVisibleForModules } from "../src/lib/organization-segments.ts";
import { realEstateAlertSearch } from "../src/lib/real-estate-notifications.ts";
import {
  realEstateItemActive,
  realEstateOverviewStart,
  REAL_ESTATE_SECTIONS,
} from "../src/lib/real-estate-workspace.ts";
const visible = (role = "proprietario", modules = []) =>
  NAV_ITEMS.filter(
    (item) =>
      navItemVisibleForRole(item.to, role) &&
      routeVisibleForModules(item.to, "real_estate", modules),
  );
test("menu imobiliário organiza rotinas reais e mantém ferramentas gerais identificadas", () => {
  const nav = realEstateNavigation(visible());
  assert.deepEqual(
    nav.operation.map((i) => i.label),
    ["Visão do dia", "Imóveis", "Clientes", "Agenda", "Atendimentos", "Negociações", "Documentos"],
  );
  assert.deepEqual(
    nav.finance.map((i) => i.label),
    ["Contratos", "Comissões e repasses", "Contas da empresa"],
  );
  assert(nav.administration.some((i) => i.to === "/processos" && i.label === "Processos gerais"));
  assert(nav.administration.some((i) => i.to === "/configuracoes"));
  assert(nav.administration.some((i) => i.to === "/assinatura"));
  assert(
    !nav.operation.some((i) =>
      ["/meu-dia", "/central", "/monitoramento", "/processos"].includes(i.to),
    ),
  );
  assert.equal(
    NAV_ITEMS.find((i) => i.to === "/processos").label,
    "Processos",
    "rótulos do núcleo permanecem intactos",
  );
  const routes = new Set(
    [...nav.operation, ...nav.finance, ...nav.administration, ...nav.system].map((i) => i.to),
  );
  assert.deepEqual(
    routes,
    new Set(visible().map((i) => i.to)),
    "todos os destinos autorizados continuam acessíveis",
  );
});
test("atalhos herdam a autorização de Imóveis e não ampliam acesso ao financeiro geral", () => {
  for (const role of ["gestor", "operacional", "atendimento", "financeiro", "visualizador"]) {
    const items = visible(role);
    const nav = realEstateNavigation(items);
    for (const item of [...nav.operation, ...nav.finance, ...nav.administration, ...nav.system])
      assert(items.some((original) => original.to === item.to));
    assert.equal(
      nav.finance.some((i) => i.to === "/financeiro"),
      navItemVisibleForRole("/financeiro", role),
    );
  }
  const external = realEstateNavigation(visible("cliente_externo"));
  assert.equal(external.operation.length, 0);
  assert.equal(external.finance.length, 0);
  const disabled = realEstateNavigation(visible("proprietario", ["clients"]));
  assert(
    ![...disabled.operation, ...disabled.finance].some((i) => i.to === "/imobiliaria/imoveis"),
  );
  assert(disabled.operation.some((i) => i.to === "/clientes"));
});
test("uma única entrada fica ativa por seção e links antigos de pendência preservam o destino", () => {
  const nav = realEstateNavigation(visible());
  const all = [...nav.operation, ...nav.finance, ...nav.administration, ...nav.system];
  for (const secao of [undefined, ...REAL_ESTATE_SECTIONS]) {
    const current = all.filter((i) => realEstateItemActive(i, "/imobiliaria/imoveis", { secao }));
    assert.equal(current.length, 1, secao);
    assert.equal(current[0].search?.secao, secao);
  }
  const notification = realEstateAlertSearch({
    secao: "negociacoes",
    pendencia: "repasse",
    busca: "IMOV-002",
  });
  const current = all.filter((i) => realEstateItemActive(i, "/imobiliaria/imoveis", notification));
  assert.equal(current.length, 1);
  assert.equal(current[0].label, "Visão do dia");
  assert.deepEqual(realEstateOverviewStart(notification), {
    search: "IMOV-002",
    kind: "repasse",
    scope: "pendencias",
    page: 1,
  });
  assert.equal(
    all.filter((i) => realEstateItemActive(i, "/processos/123", {}))[0].label,
    "Processos gerais",
  );
});
test("seções abrem todos os registros do tipo correto e parâmetros externos não mudam destinos", () => {
  for (const [secao, kind] of [
    ["negociacoes", "proposta"],
    ["contratos", "contrato"],
    ["repasses", "repasse"],
  ])
    assert.deepEqual(realEstateOverviewStart(realEstateAlertSearch({ secao })), {
      search: "",
      kind,
      scope: "todos",
      page: 1,
    });
  assert.equal(realEstateOverviewStart({ secao: "pendencias" }).scope, "pendencias");
  for (const value of ["https://example.com", "../processos", [], {}, "invalida"])
    assert.deepEqual(realEstateAlertSearch({ secao: value, localizar: value }), {});
  assert.deepEqual(realEstateAlertSearch({ localizar: "IMOV-002" }), { localizar: "IMOV-002" });
});
