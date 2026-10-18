import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function verifyRealEstateVoiceProfile(
  db,
  { org, other, actor, viewer, external, id, owner },
) {
  await db.exec(`RESET ROLE;SET test.actor='${actor}'`);
  const sql = readFileSync(
    new URL("../docs/operations/real-estate-voice-profile.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    sql,
    readFileSync(
      new URL(
        "../supabase/migrations/20261018125655_real_estate_voice_profile.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(sql);
  await db.exec(sql);
  const manage = async (action, values = {}, organization = org) =>
    (
      await db.query("SELECT real_estate_profile_manage($1,$2,$3) AS result", [
        organization,
        action,
        JSON.stringify(values),
      ])
    ).rows[0].result;
  const pub = async (token) =>
    (await db.query("SELECT real_estate_public_profile($1) AS result", [token])).rows[0].result;
  const store = (
    await db.query("SELECT token FROM fluxa_catalog_private.storefronts WHERE organization_id=$1", [
      org,
    ])
  ).rows[0];
  await db.exec(
    `UPDATE fluxa_catalog_private.storefronts SET is_enabled=true WHERE organization_id='${org}';SET ROLE authenticated`,
  );
  assert.equal((await manage("load")).profile, null);
  const path = `${org}/${id(9801)}.webp`,
    nextPath = `${org}/${id(9802)}.webp`,
    foreign = `${other}/${id(9803)}.webp`;
  await db.query(
    "INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-branding',$1),('real-estate-branding',$2)",
    [path, nextPath],
  );
  const values = {
    version: 0,
    agent_name: "Corretor Exemplo",
    agent_creci: "123/ES",
    company_creci: "456/ES",
    bio: "Apresentação pública",
    logo_path: path,
    agent_photo_path: path,
  };
  let result = await manage("save", values);
  assert.equal(result.profile.version, 1);
  await assert.rejects(manage("save", values), /CONFLICT/);
  await assert.rejects(
    manage("save", { ...values, version: 1, logo_path: foreign }),
    /PHOTO_INVALID/,
  );
  await assert.rejects(manage("save", { ...values, version: 1, agent_name: "" }), /NAME_REQUIRED/);
  await assert.rejects(
    manage("save", { ...values, version: 1, bio: "x".repeat(501) }),
    /check constraint/,
  );
  assert.equal((await manage("load")).profile.version, 1);
  await db.exec("RESET ROLE;SET ROLE anon");
  const publicProfile = await pub(store.token);
  assert.equal(publicProfile.agent_name, "Corretor Exemplo");
  assert.equal(publicProfile.logo_path, path);
  assert.deepEqual(
    Object.keys(publicProfile).sort(),
    ["agent_name", "agent_creci", "company_creci", "bio", "logo_path", "agent_photo_path"].sort(),
  );
  assert.equal(await pub(id(9999)), null);
  await assert.rejects(
    db.query("SELECT * FROM fluxa_catalog_private.business_profiles"),
    /permission denied/,
  );
  await assert.rejects(manage("load"), /permission denied/);
  assert.equal(
    (await db.query("SELECT name FROM storage.objects WHERE bucket_id='real-estate-branding'")).rows
      .length,
    1,
    "apenas imagens vinculadas são públicas",
  );
  await db.exec(
    `RESET ROLE;UPDATE fluxa_catalog_private.storefronts SET is_enabled=false WHERE organization_id='${org}';SET ROLE anon`,
  );
  assert.equal(await pub(store.token), null);
  assert.equal(
    (await db.query("SELECT name FROM storage.objects WHERE bucket_id='real-estate-branding'")).rows
      .length,
    0,
  );
  await db.exec(
    `RESET ROLE;UPDATE fluxa_catalog_private.storefronts SET is_enabled=true WHERE organization_id='${org}';UPDATE organizations SET archived_at=now() WHERE id='${org}';SET ROLE anon`,
  );
  assert.equal(await pub(store.token), null);
  await db.exec(
    `RESET ROLE;UPDATE organizations SET archived_at=null WHERE id='${org}';UPDATE organization_settings SET business_segment='legal' WHERE organization_id='${org}';SET ROLE anon`,
  );
  assert.equal(await pub(store.token), null);
  await db.exec(
    `RESET ROLE;UPDATE organization_settings SET business_segment='real_estate' WHERE organization_id='${org}';SET ROLE authenticated;SET test.actor='${viewer}'`,
  );
  assert.equal((await manage("load")).profile.agent_name, "Corretor Exemplo");
  await assert.rejects(manage("save", { ...values, version: 1 }), /DENIED/);
  await db.exec(`SET test.actor='${external}'`);
  await assert.rejects(manage("load"), /DENIED/);
  await db.exec(`SET test.actor='${id(13)}'`);
  await assert.rejects(manage("load"), /DENIED/);
  await db.exec(`SET test.actor='${actor}'`);
  await assert.rejects(
    db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('real-estate-branding',$1)", [
      foreign,
    ]),
    /row-level security/,
  );
  assert.equal(
    (
      await db.query(
        "DELETE FROM storage.objects WHERE bucket_id='real-estate-branding' AND name=$1 RETURNING name",
        [path],
      )
    ).rows.length,
    0,
    "imagem vinculada não é apagada",
  );
  result = await manage("save", {
    ...values,
    version: 1,
    logo_path: nextPath,
    agent_photo_path: null,
  });
  assert.equal(result.profile.version, 2);
  assert.deepEqual(result.removed_paths, [path]);
  assert.equal(
    (
      await db.query(
        "DELETE FROM storage.objects WHERE bucket_id='real-estate-branding' AND name=$1 RETURNING name",
        [path],
      )
    ).rows.length,
    1,
  );
  await db.exec("RESET ROLE;SET ROLE anon");
  assert.equal((await pub(store.token)).agent_photo_path, null);
  await db.exec("RESET ROLE");
  const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id='real-estate-branding'"))
    .rows[0];
  assert.equal(bucket.public, false);
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE authenticated`);
  for (let n = 0; n < 25; n++)
    await db.query("SELECT save_real_estate_property($1,$2,NULL,$3)", [
      org,
      id(9900 + n),
      JSON.stringify({
        code: `VOZ-${n}`,
        title: "Apartamento de voz",
        property_type: "apartamento",
        purpose: n === 24 ? "venda_locacao" : "locacao",
        status: "disponivel",
        owner_client_id: owner,
        street: "Rua São José Voz",
        city: "Anchieta",
        state: "ES",
        district: "Centro",
        sale_price: n === 24 ? 500000 : null,
        rent_price: n === 23 ? 1700 : 1500,
      }),
    ]);
  const search = async (page = 1, max = 1600, purpose = "locacao", organization = org) =>
    (
      await db.query("SELECT search_real_estate_properties($1,$2,$3,$4,$5,$6,$7,$8) AS result", [
        organization,
        "VOZ-",
        "apartamento",
        purpose,
        null,
        null,
        page,
        max,
      ])
    ).rows[0].result;
  const a = await search(),
    b = await search(2);
  assert.equal(a.total, 24);
  assert.equal(a.available, 24);
  assert.equal(a.items.length, 20);
  assert.equal(b.items.length, 4);
  assert.equal(new Set([...a.items, ...b.items].map((p) => p.id)).size, 24);
  assert.equal((await search(1, 1600, "venda")).total, 0);
  assert.equal((await search(1, 500000, "venda")).total, 1);
  assert.equal(
    (
      await db.query(
        "SELECT search_real_estate_properties($1,$2,$3,$4,NULL,NULL,1,1600) AS result",
        [org, "sao jose voz", "apartamento", "locacao"],
      )
    ).rows[0].result.total,
    24,
  );
  for (const args of [
    [1, -1],
    [1, 1e12],
    [0, 1600],
    [1, 1600, null],
  ])
    await assert.rejects(search(...args), /INVALID/);
  await assert.rejects(search(1, 1600, "locacao", other), /READ_DENIED/);
  await db.exec(`SET test.actor='${viewer}'`);
  assert.equal((await search()).total, 24);
  await db.exec(`SET test.actor='${external}'`);
  await assert.rejects(search(), /READ_DENIED/);
  await db.exec("RESET ROLE;SET ROLE anon");
  await assert.rejects(search(), /permission denied/);
  await db.exec("RESET ROLE");
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('search_real_estate_properties','real_estate_profile_manage','real_estate_public_profile') AND prosecdef",
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "Voz/perfil: orçamento antes da paginação, isolamento, versões concorrentes, fotos privadas e projeção pública OK.",
  );
}
