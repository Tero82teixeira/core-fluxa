import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { searchLegalGlobalProcesses } from "../src/lib/legal-global-search.ts";
import { rankGlobalSearchResults, composeGlobalSearchResults } from "../src/lib/global-search.ts";
import { legalCnjSearchParameter, formatCnjNumber } from "../src/lib/legal-search.ts";
const cnj = "00000410020268080000";
const items = Array.from({ length: 5 }, (_, i) => ({
  id: `id-${i}`,
  code: `PROC-${i}`,
  title: "Processo fictício",
  cnj_number: cnj,
  clients: { name: "Cliente fictício" },
}));
test("busca CNJ usa RPC existente e mantém os resultados no ranking com ou sem máscara", async () => {
  for (const term of [cnj, "0000041-00.2026.8.08.0000", "CNJ: 0000041"]) {
    let count = 0;
    const result = await searchLegalGlobalProcesses(
      {
        rpc: async (name, args) => {
          count++;
          assert.equal(name, "search_legal_processes");
          assert.equal(args._organization_id, "org");
        assert.equal(args._cnj,term.startsWith("CNJ:")?"0000041":cnj);
          assert.deepEqual(args._filters, { page: 0, pageSize: 5, sort: "code" });
          return { data: { items, total: 507 }, error: null };
        },
      },
      "org",
      term,
      true,
    );
    assert.equal(count, 1);
    assert.equal(result.length, 6);
    const ranked = rankGlobalSearchResults(result, term);
    assert.equal(ranked.filter((x) => x.type === "Processo").length, 5);
    assert.equal(ranked.find((x) => x.id === "legal-cnj-all").route, "/processos");
    assert.deepEqual(ranked.find((x) => x.id === "legal-cnj-all").search, {
      cnj: term.startsWith("CNJ:") ? "0000041" : cnj,
    });
    assert(ranked[0].subtitle.includes("0000041-00.2026.8.08.0000"));
    assert(ranked[0].route.startsWith("/processos/id-"));
  }
});
test("sem permissão, módulo ou CNJ não consulta a fonte jurídica", async () => {
  const client = {
    rpc: async () => {
      throw new Error("não deveria consultar");
    },
  };
  for (const [org, term, enabled] of [
    ["org", cnj, false],
    [null, cnj, true],
    ["org", "1234567", true],
    ["org", "Maria", true],
  ])
    assert.equal(await searchLegalGlobalProcesses(client, org, term, enabled), null);
  assert.deepEqual(
    await searchLegalGlobalProcesses(
      { rpc: async () => ({ data: { items: [], total: 0 }, error: null }) },
      "org",
      cnj,
      true,
    ),
    [],
  );
  await assert.rejects(
    () =>
      searchLegalGlobalProcesses(
        { rpc: async () => ({ data: null, error: new Error("indisponível") }) },
        "org",
        cnj,
        true,
      ),
    /indisponível/,
  );
});
test("atalhos jurídicos são locais e só aparecem quando autorizados", () => {
  const base = { clients: true, processes: true, finance: false };
  for (const [term, route] of [
    ["painel jurídico", "/advocacia/painel-juridico"],
    ["audiências", "/advocacia/agenda-juridica"],
  ]) {
    assert(
      composeGlobalSearchResults(term, { ...base, legal: true }).some((r) => r.route === route),
    );
    assert(!composeGlobalSearchResults(term, base).some((r) => r.route === route));
    assert(
      !composeGlobalSearchResults(term, { ...base, legal: false }).some((r) => r.route === route),
    );
  }
});
test("link de todos os resultados valida CNJ e não reaproveita filtros antigos", async () => {
  assert.equal(legalCnjSearchParameter(cnj), cnj);
  assert.equal(legalCnjSearchParameter("0000041"), "0000041");
  for (const value of [null, {}, [], "https://example.com", "123456", "0000041%", `${cnj}1`])
    assert.equal(legalCnjSearchParameter(value), undefined);
  assert.equal(formatCnjNumber(cnj), "0000041-00.2026.8.08.0000");
  const route = readFileSync("src/routes/_authenticated/processos.index.tsx", "utf8");
  assert.match(route, /cnj: legalCnjSearchParameter\(search.cnj\)/);
  assert.match(route, /if \(isLegal && search.cnj\) return/);
  assert.match(route, /\[isLegal,search.cnj\]/);
  const component = readFileSync("src/components/global-search.tsx", "utf8");
  assert.match(component, /shouldFilter=\{false\}/);
  assert.match(component, /search: result.search/);
  assert.match(component, /legalCnj && normalizedTerm === debouncedTerm && remote.isError/);
  assert.match(component, /navItemVisibleForRole\("\/advocacia\/painel-juridico",role\)/);
  const {createRootRoute,createRoute,createRouter,createMemoryHistory}=await import("@tanstack/react-router");
  const root=createRootRoute();
  const child=createRoute({getParentRoute:()=>root,path:"/processos",validateSearch:search=>({cnj:legalCnjSearchParameter(search.cnj)})});
  const router=createRouter({routeTree:root.addChildren([child]),history:createMemoryHistory({initialEntries:["/processos?etapa=arquivado"]})});
  for(const number of [cnj,"12345670020268080000","0000041"]){
    const location=router.buildLocation({to:"/processos",search:{cnj:number}});
    assert.deepEqual(location.search,{cnj:number});
    const nextRoot=createRootRoute();
    const nextChild=createRoute({getParentRoute:()=>nextRoot,path:"/processos"});
    const nextRouter=createRouter({routeTree:nextRoot.addChildren([nextChild]),history:createMemoryHistory({initialEntries:[location.href]})});
    assert.equal(nextRouter.latestLocation.search.cnj,number);
  }
});
