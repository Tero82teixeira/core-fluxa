import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import {
  buildDemoCatalog,
  demoCatalogSelection,
  demoCatalogUrl,
  filterDemoCatalog,
} from "../src/lib/real-estate-demo-catalog.ts";
import { pt } from "../src/i18n/locales/pt.ts";
import { en } from "../src/i18n/locales/en.ts";
import { es } from "../src/i18n/locales/es.ts";

test("link demonstrativo preserva somente a seleção conhecida e rejeita valores inválidos", () => {
  const ids = ["IMOV-001", "IMOV-005"];
  const url = new URL(demoCatalogUrl("https://example.com", ids));
  assert.equal(url.pathname, "/demo");
  assert.equal(url.searchParams.get("area"), "real_estate");
  assert.deepEqual(demoCatalogSelection(url.searchParams.get("catalogo")), ids);
  assert.deepEqual(demoCatalogSelection("IMOV-001,IMOV-001"), ["IMOV-001"]);
  for (const invalid of ["", "invalid", "IMOV-001,real-property", "IMOV-001,", "x".repeat(201)])
    assert.equal(demoCatalogSelection(invalid), null);
  assert.equal(demoCatalogUrl("https://example.com", []), null);
  assert.equal(demoCatalogSelection(undefined).length, 4);
});

test("catálogo combina tipo, finalidade e orçamento sem publicar rascunhos", () => {
  const items = buildDemoCatalog();
  assert.deepEqual(
    filterDemoCatalog(items, "venda", "apartment", 400000, "centro").map((p) => p.id),
    ["IMOV-005"],
  );
  assert.equal(filterDemoCatalog(items, "venda", "house", 400000, "").length, 0);
  assert.equal(filterDemoCatalog(items, "locacao", "", 1700, "ANCHIETA")[0].id, "IMOV-002");
  items[1].published = false;
  assert.equal(filterDemoCatalog(items, "locacao", "", 1700, "").length, 0);
  assert.equal(buildDemoCatalog()[1].published, true);
  assert.equal(filterDemoCatalog(items, "", "", null, "Ana Lima").length, 0);
});

test("galeria demonstrativa usa fotos locais e textos completos em três idiomas", () => {
  const items = buildDemoCatalog();
  for (const p of items) {
    assert(!("owner" in p));
    assert(!("street" in p));
    assert(p.photos.length >= 2);
    p.photos.forEach((photo) => assert(existsSync(`public${photo}`)));
  }
  for (const language of [pt, en, es]) {
    assert.deepEqual(
      Object.keys(language.realEstateDemo.catalog).sort(),
      Object.keys(pt.realEstateDemo.catalog).sort(),
    );
    assert(language.realEstateDemo.modules.catalog);
  }
  const source = readFileSync("src/components/real-estate/real-estate-demo-catalog.tsx", "utf8");
  assert.doesNotMatch(source, /integrations\/supabase|useAuth|fetch\(|localStorage|sessionStorage/);
});
