import assert from "node:assert/strict";
import { mobileCommand, publicMobileSelection } from "../src/lib/real-estate-mobile-actions.ts";
export async function verifyRealEstateMobileActions(
  db,
  { org, other, actor, viewer, external, id, prop },
) {
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE authenticated`);
  const search = async (filters, page = 1, organization = org) =>
    (
      await db.query("SELECT search_real_estate_properties($1,$2,$3,$4,NULL,NULL,$5,$6) result", [
        organization,
        filters.search,
        filters.type,
        filters.purpose,
        page,
        filters.maxPrice,
      ])
    ).rows[0].result;
  const filters = mobileCommand(
    "Apartamentos para alugar em Mobile Actions até dois mil reais",
  ).filters;
  for (let n = 0; n < 24; n++)
    await db.query("SELECT save_real_estate_property($1,$2,NULL,$3)", [
      org,
      id(99000 + n),
      JSON.stringify({
        ...prop,
        code: `MOBILE-ACTIONS-${n}`,
        title: `Mobile Actions ${n}`,
        rent_price: n < 22 ? 1600 : 2300,
        district: "Centro",
      }),
    ]);
  const a = await search(filters),
    b = await search(filters, 2);
  assert.equal(a.total, 22);
  assert.equal(a.items.length, 20);
  assert.equal(b.items.length, 2);
  assert.equal(new Set([...a.items, ...b.items].map((i) => i.id)).size, 22);
  await assert.rejects(search({ ...filters, purpose: null }), /INVALID/);
  await assert.rejects(search(filters, 1, other), /READ_DENIED/);
  const manage = async (action, property, values = {}) =>
    (
      await db.query("SELECT real_estate_catalog_manage($1,$2,$3,$4) result", [
        org,
        action,
        property,
        JSON.stringify(values),
      ])
    ).rows[0].result;
  const values = {
    title: "Anúncio público mobile",
    description: "Descrição pública para o cliente.",
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    features: "Varanda",
    is_published: false,
  };
  const property = id(99000);
  let result = await manage("save_listing", property, values);
  const listing = result.listing.id,
    token = result.store.token;
  const path = `${listing}/${id(99100)}.webp`;
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)", [
    "real-estate-photos",
    path,
  ]);
  await manage("add_photo", property, { path, caption: "Sala ilustrativa" });
  result = await manage("save_listing", property, { ...values, is_published: true });
  assert(result.listing.visible);
  let items = [{ property_id: property, code: result.source.code, token, listing: result.listing }];
  const pub = async () =>
    (await db.query("SELECT real_estate_public_catalog($1,$2,1) result", [token, [listing]]))
      .rows[0].result;
  await db.exec("RESET ROLE;SET ROLE anon");
  let catalog = await pub();
  assert.equal(catalog.total, 1);
  assert.equal(catalog.items[0].photos.length, 1);
  assert.equal(catalog.items[0].rent_price, 1600);
  const url = new URL(
    publicMobileSelection(
      "https://example.com",
      items,
      catalog.items.map((i) => i.id),
    ),
  );
  assert.equal(url.searchParams.get("imoveis"), listing);
  assert(!url.href.includes(property));
  for (const field of [
    "organization_id",
    "owner_name",
    "owner_client_id",
    "responsible_user_id",
    "notes",
  ])
    assert(!JSON.stringify(catalog).includes(`"${field}"`));
  await db.exec(`RESET ROLE;SET ROLE authenticated;SET test.actor='${viewer}'`);
  assert((await manage("load", property)).listing.visible);
  await assert.rejects(manage("save_listing", property, values), /WRITE_DENIED/);
  await db.exec(`SET test.actor='${external}'`);
  await assert.rejects(manage("load", property), /READ_DENIED/);
  await db.exec(`SET test.actor='${actor}'`);
  // Despublicação concorrente: o link não é preparado com uma seleção parcial/vazia.
  await manage("save_listing", property, values);
  await db.exec("RESET ROLE;SET ROLE anon");
  catalog = await pub();
  assert.equal(catalog.total, 0);
  assert.throws(
    () =>
      publicMobileSelection(
        "https://example.com",
        items,
        catalog.items.map((i) => i.id),
      ),
    /UNAVAILABLE/,
  );
  await db.exec("RESET ROLE");
  console.log(
    "Ações móveis: filtros falados antes da paginação, seleção por IDs públicos, fotos e valores, revogação e isolamento OK.",
  );
}
