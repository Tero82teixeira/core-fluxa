import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogPhone,
  catalogUrl,
  parseCatalogSelection,
  propertyWhatsapp,
  catalogValues,
  catalogForm,
  catalogError,
} from "../src/lib/real-estate-catalog.ts";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("seleções preservam apenas UUIDs válidos, sem converter link inválido em vitrine completa", () => {
  assert.equal(parseCatalogSelection(undefined), undefined);
  for (const input of [
    "",
    [],
    "invalido",
    `${id(1)},no`,
    Array.from({ length: 21 }, (_, n) => id(n)).join(","),
  ])
    assert.equal(parseCatalogSelection(input), null);
  assert.deepEqual(parseCatalogSelection(`${id(1)},${id(1)},${id(2)}`), [id(1), id(2)]);
  const url = new URL(catalogUrl("https://fluxa.test", id(10), [id(1), id(2)]));
  assert.equal(url.pathname, `/imoveis/${id(10)}`);
  assert.deepEqual(parseCatalogSelection(url.searchParams.get("imoveis")), [id(1), id(2)]);
  assert.equal(new URL(catalogUrl("https://fluxa.test", id(10))).search, "");
  assert.throws(() => catalogUrl("https://fluxa.test", "invalido"));
  assert.throws(() =>
    catalogUrl(
      "https://fluxa.test",
      id(10),
      Array.from({ length: 21 }, (_, n) => id(n)),
    ),
  );
});
test("WhatsApp usa contato comercial validado e codifica texto e link sem enviar automaticamente", () => {
  assert.equal(catalogPhone("(27) 99999-9999"), "5527999999999");
  assert.equal(catalogPhone("+55 (27) 99999-9999"), "5527999999999");
  for (const value of ["123", "https://evil.test", "00000000000", ""])
    assert.throws(() => catalogPhone(value));
  const url = new URL(
    propertyWhatsapp(
      "27999999999",
      { code: "IMOV-002", title: "Apartamento & varanda" },
      "https://fluxa.test/imoveis/x?imoveis=y",
      true,
    ),
  );
  assert.equal(url.origin, "https://wa.me");
  assert.equal(url.pathname, "/5527999999999");
  assert(url.searchParams.get("text").includes("agendar uma visita"));
  assert(url.searchParams.get("text").includes("Apartamento & varanda"));
  assert(url.searchParams.get("text").includes("https://fluxa.test/imoveis/x?imoveis=y"));
});
test("formulário público não reaproveita endereço completo, notas ou proprietário", () => {
  const form = catalogForm({
    title: "Casa",
    notes: "SEGREDO",
    street: "Rua privada",
    owner_name: "Proprietário privado",
  });
  assert.equal(form.description, "");
  assert.equal(form.features, "");
  assert.equal(form.is_published, false);
  for (const key of ["notes", "street", "owner_name"]) assert(!Object.hasOwn(form, key));
  assert.deepEqual(catalogValues({ ...form, bedrooms: "0", bathrooms: "2", parking: "" }), {
    ...form,
    bedrooms: 0,
    bathrooms: 2,
    parking: null,
  });
  for (const value of ["1.5", "-1", "100", "2e1"])
    assert.throws(() => catalogValues({ ...form, bedrooms: value }));
});
test("erros de publicação orientam a correção sem divulgar detalhes do banco", () => {
  assert.match(catalogError({ message: "CATALOG_PHOTO_DESCRIPTION_REQUIRED" }), /foto/);
  assert.match(catalogError({ message: "CATALOG_STOREFRONT_DISABLED" }), /ative/);
  assert.match(catalogError({ message: "CATALOG_PROPERTY_UNAVAILABLE" }), /indisponível/);
  assert.doesNotMatch(
    catalogError({ message: "secret internal relation owner_client_id" }),
    /secret|owner_client_id/,
  );
});
