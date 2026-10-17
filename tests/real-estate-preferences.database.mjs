import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function verifyRealEstatePreferences(
  db,
  { org, other, actor, viewer, external, id, property, owner },
) {
  await db.exec(`RESET ROLE;SET test.actor='${actor}'`);
  const sql = readFileSync(
    new URL("../docs/operations/real-estate-preferences.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    sql,
    readFileSync(
      new URL("../supabase/migrations/20261017221228_real_estate_preferences.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(sql);
  await db.exec(sql);
  const call = async (action, values = {}, organization = org, request = id(5000)) =>
    (
      await db.query("SELECT real_estate_preferences($1,$2,$3,$4) AS result", [
        organization,
        action,
        request,
        JSON.stringify(values),
      ])
    ).rows[0].result;
  // Isola os anúncios publicados desta verificação dos cenários anteriores.
  await db.query(
    "UPDATE fluxa_catalog_private.listings SET is_published=false WHERE organization_id=$1",
    [org],
  );
  for (let n = 0; n < 24; n++) {
    const pid = id(7000 + n),
      lid = id(7100 + n),
      path = `${lid}/${id(7200 + n)}.webp`;
    await db.query(
      `INSERT INTO real_estate_properties(id,organization_id,code,title,property_type,purpose,owner_client_id,street,district,city,state,rent_price,created_by,updated_by)
      VALUES($1,$2,$3,'Apartamento de teste','apartamento','locacao',$4,'Endereço privado','São José','Anchieta','ES',1600,$5,$5)`,
      [pid, org, `MATCH-${String(n).padStart(2, "0")}`, owner, actor],
    );
    await db.query(
      "INSERT INTO fluxa_catalog_private.listings(id,organization_id,property_id,public_title,description,bedrooms,parking) VALUES($1,$2,$3,'Opção publicada','Descrição pública completa',2,1)",
      [lid, org, pid],
    );
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-photos',$1)", [
      path,
    ]);
    await db.query(
      "INSERT INTO fluxa_catalog_private.photos(organization_id,listing_id,path,position) VALUES($1,$2,$3,0)",
      [org, lid, path],
    );
    await db.query("UPDATE fluxa_catalog_private.listings SET is_published=true WHERE id=$1", [
      lid,
    ]);
  }
  await db.exec("SET ROLE authenticated");
  assert.equal((await call("load")).version, 0);
  await assert.rejects(() => call("matches"), /PREFERENCES_REQUIRED/);
  const prefs = {
    purpose: "locacao",
    property_type: "apartamento",
    districts: [" sao jose ", "São José"],
    max_price: 1600,
    bedrooms: 2,
    parking: 1,
  };
  let data = await call("save", { version: 0, preferences: prefs });
  assert.equal(data.version, 1);
  assert.equal(data.preferences.districts.length, 1);
  assert.equal(
    (await call("load", {}, org, id(5200))).preferences,
    null,
    "não compartilha por telefone ou nome",
  );
  await assert.rejects(() => call("save", { version: 0, preferences: prefs }), /CONFLICT/);
  for (const patch of [
    { max_price: -1 },
    { bedrooms: 1.5 },
    { parking: 100 },
    { districts: [null] },
    { districts: ["x".repeat(81)] },
    { purpose: "outro" },
    { property_type: "invalid" },
    { districts: Array(11).fill("Centro") },
  ]) {
    await assert.rejects(() => call("save", { version: 1, preferences: { ...prefs, ...patch } }));
  }
  let a = await call("matches"),
    b = await call("matches", { page: 2 });
  assert.equal(a.total, 24);
  assert.equal(a.items.length, 20);
  assert.equal(b.items.length, 4);
  assert.equal(new Set([...a.items, ...b.items].map((p) => p.id)).size, 24);
  assert(a.items.every((p) => !p.issues.length && !("street" in p) && !("owner_client_id" in p)));
  // Limite exato é aceito; valores ausentes e critérios divergentes são explicados.
  await db.exec("RESET ROLE");
  await db.query("UPDATE fluxa_catalog_private.listings SET bedrooms=NULL,parking=0 WHERE id=$1", [
    id(7100),
  ]);
  await db.exec("SET ROLE authenticated");
  a = await call("matches");
  assert.equal(a.total, 23);
  b = await call("matches", { only_matches: false, page: 2 });
  assert.deepEqual(b.items.find((p) => p.id === id(7100)).issues, ["bedrooms_unknown", "parking"]);
  const selection = await call("selection", { ids: [id(7101), id(7102)] });
  assert.equal(selection.ids.length, 2);
  assert(selection.token);
  await assert.rejects(() => call("selection", { ids: [] }), /SELECTION/);
  await assert.rejects(() => call("selection", { ids: [id(99999)] }), /SELECTION/);
  await assert.rejects(
    () => call("selection", { ids: Array.from({ length: 21 }, (_, n) => id(7100 + n)) }),
    /SELECTION/,
  );
  await db.exec("RESET ROLE");
  await db.query("UPDATE real_estate_properties SET status='alugado' WHERE id=$1", [id(7001)]);
  await db.exec("SET ROLE authenticated");
  await assert.rejects(() => call("selection", { ids: [id(7101)] }), /SELECTION/);
  assert.equal((await call("matches")).total, 22);
  data = await call("save", {
    version: 1,
    preferences: {
      ...prefs,
      purpose: "venda",
      max_price: null,
      bedrooms: null,
      parking: null,
      districts: [],
      property_type: "",
    },
  });
  assert.equal(data.version, 2);
  assert.equal((await call("matches")).total, 0);
  assert(
    (await call("matches", { only_matches: false })).items.every((p) =>
      p.issues.includes("purpose"),
    ),
  );
  await db.exec(`RESET ROLE;SET test.actor='${viewer}';SET ROLE authenticated`);
  assert.equal((await call("load")).version, 2);
  assert.equal((await call("matches", { only_matches: false })).total, 23);
  await assert.rejects(() => call("save", { version: 2, preferences: prefs }), /WRITE_DENIED/);
  assert.equal(
    (
      await db.query(
        "UPDATE fluxa_inquiry_private.preferences SET purpose='locacao' WHERE organization_id=$1 RETURNING request_id",
        [org],
      )
    ).rows.length,
    0,
  );
  await db.exec(`RESET ROLE;SET test.actor='${external}';SET ROLE authenticated`);
  await assert.rejects(() => call("load"), /READ_DENIED/);
  assert.equal((await db.query("SELECT * FROM fluxa_inquiry_private.preferences")).rows.length, 0);
  await db.exec(`RESET ROLE;SET test.actor='${id(13)}';SET ROLE authenticated`);
  await assert.rejects(() => call("load"), /READ_DENIED/);
  await assert.rejects(() => call("load", {}, other), /READ_DENIED/);
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE authenticated`);
  await assert.rejects(() => call("load", {}, other), /READ_DENIED/);
  await db.exec("RESET ROLE;SET ROLE anon");
  await assert.rejects(() => call("load"), /permission denied/);
  await assert.rejects(
    () => db.query("SELECT * FROM fluxa_inquiry_private.preferences"),
    /permission denied/,
  );
  await db.exec("RESET ROLE");
  assert.equal(
    (
      await db.query(
        "SELECT prosecdef FROM pg_proc WHERE oid='public.real_estate_preferences(uuid,text,uuid,jsonb)'::regprocedure",
      )
    ).rows[0].prosecdef,
    false,
  );
  console.log(
    "Preferências: persistência, conflito, bairros, limites, compatibilidade, dados ausentes, paginação, seleção pública e isolamento OK.",
  );
}
