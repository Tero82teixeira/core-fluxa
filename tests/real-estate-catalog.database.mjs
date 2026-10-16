import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export async function verifyRealEstateCatalog(
  db,
  { org, other, actor, viewer, external, property, id, prop, otherOwner },
) {
  await db.exec(`RESET ROLE; SET test.actor='${actor}';
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon,authenticated;
    GRANT SELECT ON storage.objects TO anon,authenticated;
    GRANT INSERT,DELETE ON storage.objects TO authenticated;
  `);
  const sql = readFileSync(
    new URL("../docs/operations/real-estate-catalog.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    sql,
    readFileSync(
      new URL(
        "../supabase/migrations/20261016193003_real_estate_public_catalog.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(sql);
  await db.exec(sql);
  const manage = async (action, values = {}, pid = property, organization = org) =>
    (
      await db.query("SELECT real_estate_catalog_manage($1,$2,$3,$4) AS result", [
        organization,
        action,
        pid,
        JSON.stringify(values),
      ])
    ).rows[0].result;
  const pub = async (
    token,
    ids = null,
    page = 1,
    purpose = null,
    type = null,
    max = null,
    search = null,
  ) =>
    (
      await db.query("SELECT real_estate_public_catalog($1,$2,$3,$4,$5,$6,$7) AS result", [
        token,
        ids,
        page,
        purpose,
        type,
        max,
        search,
      ])
    ).rows[0].result;
  const values = {
    title: "Apartamento público",
    description: "Apartamento para locação com varanda.",
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    features: "Elevador e varanda",
    is_published: false,
  };
  await db.exec("SET ROLE authenticated");
  let draft = await manage("save_listing", values);
  assert.equal(draft.listing.is_published, false);
  const listing = draft.listing.id;
  const store = await manage(
    "save_store",
    { company_name: "Imobiliária Exemplo", whatsapp: "5527999999999", is_enabled: true },
    null,
  );
  const token = store.store.token;
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.equal((await pub(token)).total, 0);
  await assert.rejects(
    db.query("SELECT * FROM fluxa_catalog_private.listings"),
    /permission denied/,
  );
  await assert.rejects(manage("load"), /permission denied/);
  await db.exec(`RESET ROLE; SET ROLE authenticated; SET test.actor='${viewer}'`);
  assert.equal((await manage("load")).listing.id, listing);
  await assert.rejects(manage("save_listing", values), /WRITE_DENIED/);
  await db.exec(`SET test.actor='${external}'`);
  await assert.rejects(manage("load"), /READ_DENIED/);
  await db.exec(`SET test.actor='${actor}'`);
  await assert.rejects(
    manage("save_listing", { ...values, is_published: true }),
    /PHOTO_DESCRIPTION_REQUIRED/,
  );
  const path = `${listing}/${id(500)}.webp`;
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-photos',$1)", [
    path,
  ]);
  await manage("add_photo", { path, caption: "Vista da sala" });
  await manage("save_listing", { ...values, is_published: true });
  // Publicar novamente atualiza o mesmo anúncio, sem duplicar ou perder fotos.
  await manage("save_listing", { ...values, is_published: true, title: "Apartamento atualizado" });
  await db.exec("RESET ROLE; SET ROLE anon");
  let catalog = await pub(token);
  assert.equal(catalog.total, 1);
  assert.equal(catalog.items[0].title, "Apartamento atualizado");
  assert.equal(catalog.whatsapp, "5527999999999");
  assert.equal(catalog.items[0].photos.length, 1);
  assert.equal(catalog.items[0].photos[0].path, path);
  const fields = Object.keys(catalog.items[0]).sort();
  assert.deepEqual(
    fields,
    [
      "id",
      "title",
      "description",
      "bedrooms",
      "bathrooms",
      "parking",
      "features",
      "code",
      "property_type",
      "purpose",
      "sale_price",
      "rent_price",
      "area_m2",
      "district",
      "city",
      "state",
      "photos",
    ].sort(),
  );
  const text = JSON.stringify(catalog);
  for (const field of [
    "owner_name",
    "owner_client_id",
    "responsible_user_id",
    "notes",
    "street",
    "number",
    "zip_code",
    "complement",
    "documents",
    "organization_id",
    "property_id",
  ])
    assert(!Object.hasOwn(catalog.items[0], field), field);
  assert(!text.includes("Rua teste"));
  assert(!text.includes("Proprietário Teste"));
  assert.equal((await db.query("SELECT name FROM storage.objects")).rows.length, 1);
  assert.equal((await pub(token, [id(99999)])).total, 0);
  assert.equal((await pub(token, [])).total, 0);
  assert.equal((await pub(token, [listing], 1, "locacao", "apartamento", 1600, "APTO")).total, 1);
  assert.equal((await pub(token, null, 1, "venda")).total, 0);
  assert.equal((await pub(token, null, 1, null, null, 1000)).total, 0);
  assert.equal((await pub(token, null, 1, null, null, null, "%")).total, 0);
  await assert.rejects(
    pub(
      token,
      Array.from({ length: 21 }, () => listing),
    ),
    /INPUT_INVALID/,
  );
  await assert.rejects(pub(token, null, 0), /INPUT_INVALID/);
  await assert.rejects(pub(token, null, 1, "invalido"), /INPUT_INVALID/);
  // Segunda empresa não consegue editar ou usar o objeto privado da primeira.
  await db.exec(`RESET ROLE; SET ROLE authenticated; SET test.actor='${id(13)}'`);
  await assert.rejects(manage("load"), /READ_DENIED/);
  await assert.rejects(manage("save_listing", values, property, other), /PROPERTY_DENIED/);
  const privatePath = `${listing}/${id(501)}.webp`;
  await assert.rejects(
    db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-photos',$1)", [
      privatePath,
    ]),
    /row-level security/,
  );
  await db.query("SELECT save_real_estate_property($1,$2,NULL,$3)", [
    other,
    id(510),
    JSON.stringify({
      ...prop,
      code: "OUTRO-ANUNCIO",
      owner_client_id: otherOwner,
      responsible_user_id: id(13),
    }),
  ]);
  const otherDraft = await manage("save_listing", values, id(510), other);
  const otherListing = otherDraft.listing.id;
  await manage(
    "save_store",
    { company_name: "Outra imobiliária", whatsapp: "5527999999999", is_enabled: true },
    null,
    other,
  );
  const otherPath = `${otherListing}/${id(511)}.webp`;
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-photos',$1)", [
    otherPath,
  ]);
  await manage("add_photo", { path: otherPath }, id(510), other);
  await manage("save_listing", { ...values, is_published: true }, id(510), other);
  assert.equal((await pub(token, [otherListing])).total, 0);
  await db.exec(`SET test.actor='${actor}'`);
  assert.equal((await manage("load")).listing.id, listing);
  // Arquivo sem vínculo de foto e rascunho não são legíveis pelo público.
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-photos',$1)", [
    privatePath,
  ]);
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.equal(
    (await db.query("SELECT name FROM storage.objects WHERE name=$1", [privatePath])).rows.length,
    0,
  );
  await db.exec(`RESET ROLE; SET ROLE authenticated; SET test.actor='${actor}'`);
  await manage("save_listing", values);
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.equal((await pub(token)).total, 0);
  assert.equal(
    (await db.query("SELECT name FROM storage.objects WHERE name=$1", [path])).rows.length,
    0,
  );
  await db.exec(`RESET ROLE; SET ROLE authenticated; SET test.actor='${actor}'`);
  await manage("save_listing", { ...values, is_published: true });
  await db.query("SELECT save_real_estate_property($1,$2,1,$3)", [
    org,
    property,
    JSON.stringify({ ...prop, status: "inativo" }),
  ]);
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.equal((await pub(token)).total, 0);
  await db.exec(`RESET ROLE; SET ROLE authenticated; SET test.actor='${actor}'`);
  await db.query("SELECT save_real_estate_property($1,$2,2,$3)", [
    org,
    property,
    JSON.stringify(prop),
  ]);
  await manage(
    "save_store",
    { company_name: "Imobiliária Exemplo", whatsapp: "5527999999999", is_enabled: false },
    null,
  );
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.equal(await pub(token), null);
  await db.exec(`RESET ROLE; SET ROLE authenticated; SET test.actor='${actor}'`);
  await manage(
    "save_store",
    { company_name: "Imobiliária Exemplo", whatsapp: "5527999999999", is_enabled: true },
    null,
  );
  const photo = (await manage("load")).listing.photos[0];
  const removed = await manage("remove_photo", { id: photo.id });
  assert.equal(removed.listing.is_published, false);
  assert.equal(removed.removed_path, path);
  // Limite de 20 fotos e caminhos alheios são verificados também no banco.
  await assert.rejects(
    manage("add_photo", { path: otherPath }),
    /PHOTO_MISSING|row-level security|check constraint/,
  );
  for (let i = 0; i < 20; i++) {
    const next = `${listing}/${id(600 + i)}.webp`;
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-photos',$1)", [
      next,
    ]);
    await manage("add_photo", { path: next });
  }
  const overflow = `${listing}/${id(650)}.webp`;
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-photos',$1)", [
    overflow,
  ]);
  await assert.rejects(manage("add_photo", { path: overflow }), /PHOTO_LIMIT/);
  await manage("save_listing", { ...values, is_published: true });
  await db.exec("RESET ROLE");
  await db.query("UPDATE organizations SET archived_at=now() WHERE id=$1", [org]);
  await db.exec("SET ROLE anon");
  assert.equal(await pub(token), null);
  await db.exec("RESET ROLE");
  await db.query("UPDATE organizations SET archived_at=NULL WHERE id=$1", [org]);
  await db.exec(`SET ROLE authenticated; SET test.actor='${actor}'`);
  for (let i = 0; i < 21; i++) {
    const pid = id(1000 + i);
    const extra = await manage("save_listing", { ...values, title: `Opção ${i}` }, pid);
    const extraPath = `${extra.listing.id}/${id(700 + i)}.webp`;
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-photos',$1)", [
      extraPath,
    ]);
    await manage("add_photo", { path: extraPath }, pid);
    await manage("save_listing", { ...values, title: `Opção ${i}`, is_published: true }, pid);
  }
  await db.exec("RESET ROLE; SET ROLE anon");
  const first = await pub(token),
    second = await pub(token, null, 2);
  assert.equal(first.total, 22);
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 2);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 22);
  assert.equal((await pub(token, [listing, otherListing])).total, 1);
  await db.exec("RESET ROLE");
  const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id='real-estate-photos'"))
    .rows[0];
  assert.equal(bucket.public, false);
  assert.deepEqual(bucket.allowed_mime_types, ["image/webp"]);
  assert.equal(Number(bucket.file_size_limit), 5242880);
  const definer = (
    await db.query(
      "SELECT p.proname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='fluxa_catalog_private' AND p.prosecdef",
    )
  ).rows;
  assert.deepEqual(definer.map((f) => f.proname).sort(), [
    "is_public_listing",
    "public_photo_access",
    "read_catalog",
  ]);
  assert(definer.every((f) => f.proconfig.some((setting) => setting.startsWith("search_path="))));
  console.log(
    "Vitrine: publicação, seleção, fotos privadas, campos públicos, preços/filtros, limite, despublicação, indisponibilidade e isolamento por empresa/perfil OK.",
  );
}
