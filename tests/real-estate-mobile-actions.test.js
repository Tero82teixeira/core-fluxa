import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyMobileFilters,
  mobileCommand,
  needsMobilePurpose,
  selectionCatalog,
  publicMobileSelection,
  mapMobileSelection,
  shareMobileLink,
} from "../src/lib/real-estate-mobile-actions.ts";
import { buildMobileDemo } from "../src/lib/real-estate-mobile-demo.ts";
import { buildRealEstateDemo } from "../src/lib/real-estate-public-demo.ts";
test("comandos de agenda, cliente e imóvel preservam intenção e deixam orçamento ambíguo para escolha", () => {
  for (const text of [
    "Quem preciso atender hoje?",
    "Quem eu devo atender hoje?",
    "Minha agenda de hoje",
    "visitas hoje",
    "Who should I contact today?",
    "¿A quién debo atender hoy?",
  ])
    assert.deepEqual(mobileCommand(text), { kind: "agenda" }, text);
  assert.deepEqual(mobileCommand("Cliente Casa Nova"), { kind: "client", name: "Casa Nova" });
  assert.deepEqual(mobileCommand("cliente Agenda Hoje"), { kind: "client", name: "Agenda Hoje" });
  assert.deepEqual(mobileCommand("Marina Costa"), { kind: "client", name: "Marina Costa" });
  assert.deepEqual(mobileCommand("Apartamentos para alugar no Centro até dois mil reais"), {
    kind: "properties",
    filters: { search: "centro", type: "apartamento", purpose: "locacao", maxPrice: 2000 },
  });
  const ambiguous = mobileCommand("Apartamentos no Centro até R$ 2 mil");
  assert.equal(ambiguous.kind, "properties");
  assert.equal(ambiguous.filters.maxPrice, 2000);
  assert(needsMobilePurpose(ambiguous.filters));
  assert(!needsMobilePurpose({ ...ambiguous.filters, purpose: "locacao" }));
  assert.equal(
    mobileCommand("Apague o cliente Carlos").kind,
    "client",
    "comandos não autorizados nunca viram mutação",
  );
});
test("demonstração combina busca falada com orçamento e seleção pública de fotos, sem ampliar para catálogo inteiro", async () => {
  const source = buildMobileDemo(buildRealEstateDemo());
  const filters = mobileCommand("Apartamentos para alugar no Centro até dois mil reais").filters;
  const page = await source.properties(filters, 1);
  assert.equal(page.total, 1);
  assert.equal(page.items[0].id, "IMOV-002");
  assert.equal((await source.properties(filters, 2)).items.length, 0);
  assert.equal((await source.properties({ ...filters, maxPrice: 1500 }, 1)).total, 0);
  assert.equal(
    (await source.properties({ ...filters, purpose: "venda", maxPrice: 400000 }, 1)).items[0].id,
    "IMOV-005",
  );
  await assert.rejects(source.properties({ ...filters, purpose: "" }, 1), /PURPOSE_REQUIRED/);
  assert.equal(
    (await source.properties({ ...emptyMobileFilters(), search: "jardins" }, 1)).total,
    2,
  );
  const preview = await source.preview(["IMOV-002"]);
  assert.equal(preview[0].listing.photos.length, 2);
  const url = new URL(await source.share(["IMOV-002"], "https://example.com"));
  assert.equal(url.pathname, "/demo");
  assert.equal(url.searchParams.get("catalogo"), "IMOV-002");
  assert.equal(url.searchParams.get("area"), "real_estate");
  await assert.rejects(source.share(["IMOV-003"], "https://example.com"), /UNAVAILABLE/);
  await assert.rejects(source.share([], "https://example.com"), /INVALID/);
});
test("link usa IDs públicos, exige uma única vitrine e recusa anúncio retirado antes do compartilhamento", () => {
  const token = "00000000-0000-0000-0000-000000000001",
    listing = "00000000-0000-0000-0000-000000000002",
    property = "00000000-0000-0000-0000-000000000003";
  const items = [{ property_id: property, code: "IMOV-002", token, listing: { id: listing } }];
  const url = new URL(publicMobileSelection("https://example.com", items, [listing]));
  assert.equal(url.pathname, `/imoveis/${token}`);
  assert.equal(url.searchParams.get("imoveis"), listing);
  assert(!url.href.includes(property));
  assert.equal([...url.searchParams].length, 1);
  assert.throws(() => publicMobileSelection("https://example.com", items, []), /UNAVAILABLE/);
  assert.throws(() => selectionCatalog([{ ...items[0], listing: null }]), /UNAVAILABLE/);
  assert.throws(
    () => selectionCatalog([...items, { ...items[0], property_id: "different", token: "other" }]),
    /UNAVAILABLE/,
  );
  assert.throws(() => selectionCatalog([...items, ...items]), /INVALID/);
  assert.throws(() => selectionCatalog([]), /INVALID/);
});
test("conferência de seleção limita concorrência, preserva ordem e rejeita excesso antes de consultar", async () => {
  let active = 0,
    max = 0;
  const values = await mapMobileSelection(
    Array.from({ length: 20 }, (_, i) => String(i)),
    async (id) => {
      active++;
      max = Math.max(max, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return id;
    },
  );
  assert.equal(max, 4);
  assert.deepEqual(
    values,
    Array.from({ length: 20 }, (_, i) => String(i)),
  );
  let calls = 0;
  await assert.rejects(
    mapMobileSelection(
      Array.from({ length: 21 }, (_, i) => String(i)),
      async () => {
        calls++;
      },
    ),
    /INVALID/,
  );
  await assert.rejects(
    mapMobileSelection(["same", "same"], async () => {
      calls++;
    }),
    /INVALID/,
  );
  assert.equal(calls, 0);
});
test("compartilhar respeita cancelamento e oferece cópia manual quando APIs do navegador falham", async () => {
  const url = "https://example.com/imoveis/token?imoveis=id";
  let native = 0,
    copies = 0;
  const clipboard = {
    writeText: async (value) => {
      assert.equal(value, url);
      copies++;
    },
  };
  assert.equal(
    await shareMobileLink(url, "Seleção", {
      share: async (data) => {
        assert.equal(data.url, url);
        native++;
      },
      clipboard,
    }),
    "shared",
  );
  assert.equal(native, 1);
  assert.equal(copies, 0);
  assert.equal(
    await shareMobileLink(url, "Seleção", {
      share: async () => {
        throw Object.assign(new Error(), { name: "AbortError" });
      },
      clipboard,
    }),
    "cancelled",
  );
  assert.equal(copies, 0);
  assert.equal(await shareMobileLink(url, "Seleção", { clipboard }), "copied");
  assert.equal(copies, 1);
  assert.equal(
    await shareMobileLink(url, "Seleção", {
      share: async () => {
        throw new Error("NotAllowed");
      },
      clipboard,
    }),
    "copied",
  );
  assert.equal(
    await shareMobileLink(url, "Seleção", {
      clipboard: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
    "manual",
  );
  assert.equal(await shareMobileLink(url, "Seleção", {}), "manual");
});
