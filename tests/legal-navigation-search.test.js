import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { NAV_ITEMS, legalNavigation, navItemVisibleForRole } from "../src/lib/navigation.ts";
import { routeVisibleForModules } from "../src/lib/organization-segments.ts";
import { legalCnjSearch } from "../src/lib/legal-search.ts";
const visible = (role = "proprietario", modules = []) =>
  NAV_ITEMS.filter(
    (item) =>
      navItemVisibleForRole(item.to, role) && routeVisibleForModules(item.to, "legal", modules),
  );
test("menu jurídico prioriza rotina e preserva todos os destinos permitidos", () => {
  const nav = legalNavigation(visible());
  assert.deepEqual(
    nav.operation.map((i) => i.label),
    ["Painel Jurídico", "Agenda Jurídica", "Clientes", "Processos", "Tarefas", "Documentos"],
  );
  assert.deepEqual(
    nav.management.map((i) => i.to),
    ["/comunicacao", "/financeiro"],
  );
  for (const path of ["/meu-dia", "/central", "/monitoramento", "/configuracoes", "/assinatura"])
    assert(nav.administration.some((i) => i.to === path));
  const destinations = Object.values(nav)
    .flat()
    .map((i) => i.to);
  assert.equal(new Set(destinations).size, destinations.length);
  assert.deepEqual(new Set(destinations), new Set(visible().map((i) => i.to)));
});
test("menu jurídico mantém papéis e módulos sem expor financeiro ou agenda a outros perfis", () => {
  for (const role of [
    "operacional",
    "gestor",
    "atendimento",
    "financeiro",
    "visualizador",
    "cliente_externo",
  ]) {
    const items = visible(role),
      nav = legalNavigation(items);
    assert.deepEqual(
      new Set(
        Object.values(nav)
          .flat()
          .map((i) => i.to),
      ),
      new Set(items.map((i) => i.to)),
    );
    assert.equal(
      nav.management.some((i) => i.to === "/financeiro"),
      navItemVisibleForRole("/financeiro", role),
    );
  }
  const nav = legalNavigation(visible("proprietario", ["clients"]));
  assert(!nav.operation.some((i) => i.to.startsWith("/advocacia")));
  assert(nav.operation.some((i) => i.to === "/clientes"));
  const route = readFileSync("src/components/layout/app-sidebar.tsx", "utf8");
  assert.match(route, /isLegal && legal\.operation\.some/);
  assert.match(route, /rotina-juridica/);
});
test("CNJ mascarado e sem máscara normalizam sem capturar protocolos numéricos curtos", () => {
  for (const query of [
    "0000041-00.2026.8.08.0000",
    "00000410020268080000",
    " CNJ: 0000041-00.2026.8.08.0000 ",
  ])
    assert.equal(legalCnjSearch(query), "00000410020268080000");
  assert.equal(legalCnjSearch("CNJ: 0000041"), "0000041");
  for (const query of [
    "0000041",
    "123456789",
    "PROC-2026-0001",
    "Maria",
    "CNJ: 123456",
    "CNJ: 0000041%",
    "000004100202680800000",
  ])
    assert.equal(legalCnjSearch(query), null, query);
});
test("busca jurídica usa a lista paginada, mantém os demais filtros e exibe CNJ nos resultados", () => {
  const page = readFileSync("src/routes/_authenticated/processos.index.tsx", "utf8");
  assert.match(page, /isLegal \? legalCnjSearch\(debounced\) : null/);
  assert.match(page, /searchingCnj \? "tabela" : view/);
  assert.match(page, /useProcessesPage\(organizationId, filters, !searchingCnj\)/);
  assert.match(page, /useLegalCnjProcesses\(organizationId, cnj, filters\)/);
  assert.match(page, /formatCnjNumber\(process.cnj_number\)/);
});
