import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyPreferences,
  validatePreferences,
  preferenceIssues,
} from "../src/lib/real-estate-preferences.ts";
import { buildDemoCatalog, demoCatalogUrl } from "../src/lib/real-estate-demo-catalog.ts";
import { pt } from "../src/i18n/locales/pt.ts";
import { en } from "../src/i18n/locales/en.ts";
import { es } from "../src/i18n/locales/es.ts";
const listing = {
  purpose: "venda_locacao",
  property_type: "apartamento",
  district: "São José",
  sale_price: 390000,
  rent_price: 1600,
  bedrooms: 2,
  parking: 1,
};
test("preferências aceitam limites exatos, ambas finalidades e bairros completos sem acento", () => {
  const prefs = validatePreferences({
    ...emptyPreferences("locacao"),
    property_type: "apartamento",
    max_price: 1600,
    bedrooms: 2,
    parking: 1,
    districts: [" sao jose ", "São José"],
  });
  assert.equal(prefs.districts.length, 1);
  assert.deepEqual(preferenceIssues(prefs, listing), []);
  assert.deepEqual(preferenceIssues({ ...prefs, districts: ["José"] }, listing), ["districts"]);
  assert.deepEqual(
    preferenceIssues({ ...prefs, max_price: 1599, bedrooms: 3, parking: 2 }, listing),
    ["max_price", "bedrooms", "parking"],
  );
  assert.deepEqual(
    preferenceIssues(prefs, { ...listing, rent_price: null, bedrooms: null, parking: null }),
    ["price_unknown", "bedrooms_unknown", "parking_unknown"],
  );
  for (const patch of [
    { max_price: NaN },
    { max_price: 0 },
    { bedrooms: 1.5 },
    { parking: 100 },
    { districts: [""] },
    { districts: Array(11).fill("Centro") },
  ])
    assert.throws(() => validatePreferences({ ...prefs, ...patch }), /INVALID/);
});
test("demo seleciona apartamento para compra e link não inclui preferências nem dados pessoais", () => {
  const prefs = {
    ...emptyPreferences(),
    property_type: "apartamento",
    max_price: 400000,
    districts: ["Centro"],
    bedrooms: 2,
    parking: 1,
  };
  const chosen = buildDemoCatalog()
    .filter(
      (p) =>
        !preferenceIssues(prefs, {
          purpose: p.purpose,
          property_type: p.kind === "house" ? "casa" : "apartamento",
          district: p.district,
          sale_price: p.purpose === "venda" ? p.amount : null,
          rent_price: p.purpose === "locacao" ? p.amount : null,
          bedrooms: p.bedrooms,
          parking: p.parking,
        }).length,
    )
    .map((p) => p.id);
  assert.deepEqual(chosen, ["IMOV-005"]);
  const url = new URL(demoCatalogUrl("https://example.com", chosen));
  assert.deepEqual([...url.searchParams.keys()], ["area", "catalogo"]);
  assert.deepEqual(
    Object.keys(pt.realEstateDemo.preferences).sort(),
    Object.keys(en.realEstateDemo.preferences).sort(),
  );
  assert.deepEqual(
    Object.keys(pt.realEstateDemo.preferences).sort(),
    Object.keys(es.realEstateDemo.preferences).sort(),
  );
});
