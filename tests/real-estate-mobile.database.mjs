import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function verifyRealEstateMobile(
  db,
  { org, other, actor, viewer, external, id, owner, prop },
) {
  await db.exec(`RESET ROLE;SET test.actor='${actor}';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS city text,ADD COLUMN IF NOT EXISTS state text,ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo',ADD COLUMN IF NOT EXISTS phone text,ADD COLUMN IF NOT EXISTS whatsapp text,ADD COLUMN IF NOT EXISTS email text,ADD COLUMN IF NOT EXISTS owner_name text;
    CREATE VIEW clients_secure WITH(security_invoker=true) AS SELECT id,organization_id,name,city,state,status,archived_at,owner_name,
     CASE WHEN has_org_role(organization_id,ARRAY['proprietario']::app_role[]) THEN phone END phone,
     CASE WHEN has_org_role(organization_id,ARRAY['proprietario']::app_role[]) THEN whatsapp END whatsapp,
     CASE WHEN has_org_role(organization_id,ARRAY['proprietario']::app_role[]) THEN email END email
     FROM clients WHERE id<>'${id(97000)}';
    GRANT SELECT ON clients_secure TO authenticated;
  `);
  const sql = readFileSync(
    new URL("../docs/operations/real-estate-mobile-client.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    sql,
    readFileSync(
      new URL(
        "../supabase/migrations/20261018144521_real_estate_mobile_client.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(sql);
  await db.exec(sql);
  for (let n = 0; n < 23; n++)
    await db.query("INSERT INTO clients(id,organization_id,name,phone) VALUES($1,$2,$3,$4)", [
      id(96000 + n),
      org,
      `Márcia Consulta ${String(n).padStart(2, "0")}`,
      "5527999999999",
    ]);
  await db.query(
    "INSERT INTO clients(id,organization_id,name,archived_at) VALUES($1,$2,$3,now()),($4,$2,$3,null),($5,$6,$3,null)",
    [id(96999), org, "Márcia Consulta", id(97000), id(97001), other],
  );
  await db.query("UPDATE clients SET phone=$1 WHERE id=$2", ["5527999999999", owner]);
  const read = async (action, values = {}, organization = org) =>
    (
      await db.query("SELECT real_estate_mobile($1,$2,$3) result", [
        organization,
        action,
        JSON.stringify(values),
      ])
    ).rows[0].result;
  await db.exec("SET ROLE authenticated");
  const first = await read("search", { search: "marcia consulta" }),
    second = await read("search", { search: "marcia consulta", page: 2 });
  assert.equal(first.total, 23);
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 3);
  assert.equal(new Set([...first.items, ...second.items].map((x) => x.id)).size, 23);
  assert.equal((await read("search", { search: "%_" })).total, 0, "busca literal não vira curinga");
  assert.equal((await read("search", { search: "Márcia Consulta 00" })).total, 1);
  const summary = await read("client", { client: owner });
  assert.equal(summary.client.phone, "5527999999999");
  assert(!("organization_id" in summary.client));
  const all = [];
  for (let page = 1; page <= Math.ceil(summary.total / 20); page++)
    all.push(...(await read("client", { client: owner, page })).items);
  assert.equal(all.length, summary.total);
  assert.equal(new Set(all.map((x) => x.kind + ":" + x.id)).size, summary.total);
  assert(all.some((x) => x.kind === "interest"));
  const contracts = (
    await db.query(
      "SELECT c.id,e.status,e.amount FROM real_estate_contracts c CROSS JOIN LATERAL(SELECT status,amount FROM real_estate_contract_events e WHERE e.organization_id=c.organization_id AND e.property_id=c.property_id AND e.contract_id=c.id ORDER BY version DESC LIMIT 1)e WHERE c.organization_id=$1 AND client_id=$2",
      [org, owner],
    )
  ).rows;
  assert(contracts.length > 0);
  for (const c of contracts) {
    const entry = all.find((x) => x.kind === "contract" && x.id === c.id);
    assert(entry);
    assert.equal(entry.status, c.status);
    assert.equal(entry.amount, Number(c.amount));
  }
  const proposals = all.filter((x) => x.kind === "proposal");
  assert(proposals.length > 0);
  assert.equal(
    (await read("client", { client: id(96000) })).total,
    0,
    "nome semelhante não vincula históricos",
  );
  await assert.rejects(
    read("client", { client: id(97000) }),
    /READ_DENIED/,
    "visão segura restringe ficha",
  );
  await assert.rejects(read("client", { client: id(97001) }), /READ_DENIED/);
  await assert.rejects(read("search", { search: "marcia" }, other), /READ_DENIED/);
  const properties = await read("properties", { search: "100% Seguro" });
  assert(properties.total > 0);
  assert(properties.items.every((x) => x.title.includes("100% Seguro")));
  await db.exec(
    `RESET ROLE;INSERT INTO organization_members VALUES('${org}','${id(97510)}','operacional',true);SET ROLE authenticated`,
  );
  await db.query("SELECT save_real_estate_property($1,$2,NULL,$3)", [
    org,
    id(97500),
    JSON.stringify({ ...prop, code: "MOBILE-AGENDA" }),
  ]);
  await db.query("SELECT save_real_estate_interest($1,$2,NULL,$3)", [
    org,
    id(97501),
    JSON.stringify({
      property_id: id(97500),
      client_id: id(96000),
      purpose: "locacao",
      status: "novo",
      responsible_user_id: actor,
    }),
  ]);
  const day = (
    await db.query(
      "SELECT (date_trunc('day',now())+interval '1 day')::text AS start,(date_trunc('day',now())+interval '2 days')::text AS finish",
    )
  ).rows[0];
  for (const [n, responsible, hours] of [
    [97502, actor, 10],
    [97503, id(97510), 11],
    [97504, actor, 24],
  ]) {
    const start = new Date(new Date(day.start).getTime() + hours * 3600000);
    await db.query("SELECT save_real_estate_visit($1,$2,NULL,$3)", [
      org,
      id(n),
      JSON.stringify({
        property_id: id(97500),
        interest_id: id(97501),
        responsible_user_id: responsible,
        starts_at: start.toISOString(),
        ends_at: new Date(+start + 1800000).toISOString(),
        status: "agendada",
      }),
    ]);
  }
  const today = await read("today", { start: day.start, end: day.finish });
  assert(
    today.items.some((x) => x.id === id(97502)),
    "visita do próprio corretor está no dia",
  );
  assert(
    !today.items.some((x) => [id(97503), id(97504)].includes(x.id)),
    "não inclui outro responsável nem próximo dia",
  );
  for (const item of today.items)
    assert(new Date(item.at) >= new Date(day.start) && new Date(item.at) < new Date(day.finish));
  await assert.rejects(read("today", { start: day.start, end: day.start }), /INVALID/);
  for (const values of [
    { search: "a" },
    { search: "x".repeat(101) },
    { search: "marcia", page: 0 },
  ])
    await assert.rejects(read("search", values), /INVALID/);
  await db.exec(`SET test.actor='${viewer}'`);
  assert.equal(
    (await read("client", { client: owner })).client.phone,
    null,
    "campos sensíveis respeitam clients_secure",
  );
  assert.equal((await read("search", { search: "marcia consulta" })).total, 23);
  await db.exec(`SET test.actor='${external}'`);
  await assert.rejects(read("search", { search: "marcia" }), /READ_DENIED/);
  await db.exec("RESET ROLE;SET ROLE anon");
  await assert.rejects(read("search", { search: "marcia" }), /permission denied/);
  await db.exec("RESET ROLE");
  assert.equal(
    (
      await db.query(
        "SELECT prosecdef FROM pg_proc WHERE oid='real_estate_mobile(uuid,text,jsonb)'::regprocedure",
      )
    ).rows[0].prosecdef,
    false,
  );
  console.log(
    "Mobile: busca paginada, nomes ambíguos, visão segura, histórico explícito, contratos atuais e isolamento OK.",
  );
}
