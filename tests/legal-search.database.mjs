import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function verifyLegalSearch({
  db,
  org,
  other,
  actor,
  viewer,
  external,
  inactive,
  client,
  caseId,
  id,
}) {
  await db.exec(`RESET ROLE;
    CREATE TABLE service_types(id uuid PRIMARY KEY,organization_id uuid,name text);
    ALTER TABLE clients ADD COLUMN status text DEFAULT 'ativo';
    ALTER TABLE processes ADD COLUMN priority text DEFAULT 'media', ADD COLUMN financial_status text DEFAULT 'pendente', ADD COLUMN service_type_id uuid, ADD COLUMN last_movement_at timestamptz;
    INSERT INTO service_types VALUES('${id(19000)}','${org}','Serviço teste');
    UPDATE processes SET priority='alta',service_type_id='${id(19000)}',last_movement_at='2026-10-18T12:00Z' WHERE id='${caseId}';
    UPDATE organization_settings SET enabled_modules='["legal_workspace"]' WHERE organization_id='${org}';
    SET test.actor='${actor}';
    INSERT INTO legal_case_profiles(organization_id,process_id,cnj_number,created_by,updated_by)
      SELECT '${org}',p.id,'0000041'||lpad(row_number() OVER(ORDER BY p.id)::text,13,'0'),'${actor}','${actor}' FROM processes p WHERE p.organization_id='${org}' AND p.code LIKE 'PROC-%' AND p.id<>'${caseId}';
    UPDATE legal_case_profiles SET cnj_number='00000410020268080000' WHERE process_id='${caseId}';
    INSERT INTO legal_case_profiles(organization_id,process_id,cnj_number,created_by,updated_by) VALUES('${org}','${id(5061)}','00000419999999999999','${actor}','${actor}');
    UPDATE legal_case_profiles SET cnj_number='00000410020268080000' WHERE process_id='${id(5062)}';
    INSERT INTO legal_case_profiles(organization_id,process_id,cnj_number,created_by,updated_by) VALUES('${org}','${id(5063)}','00000410020268080000','${actor}','${actor}');
  `);
  const sql = readFileSync("supabase/migrations/20261023120200_legal_cnj_search.sql", "utf8");
  assert.equal(sql, readFileSync("docs/operations/legal-cnj-search.sql", "utf8"));
  await db.exec(sql);
  await db.exec("SET ROLE authenticated");
  const query = async (cnj = "00000410020268080000", filters = {}, organization = org) =>
    (
      await db.query("SELECT search_legal_processes($1,$2,$3) AS data", [
        organization,
        cnj,
        JSON.stringify(filters),
      ])
    ).rows[0].data;
  const exact = await query();
  assert.equal(exact.total, 1);
  assert.equal(exact.items[0].id, caseId);
  assert.equal(exact.items[0].cnj_number, "00000410020268080000");
  assert.equal(exact.items[0].clients.id, client);
  assert.equal(exact.items[0].service_types.name, "Serviço teste");
  const seen = new Set();
  for (let page = 0; page < 21; page++) {
    const batch = await query("0000041", { page, pageSize: 25 });
    assert.equal(batch.total, 507);
    assert.equal(batch.items.length, page === 20 ? 7 : 25);
    for (const p of batch.items) {
      assert(!seen.has(p.id));
      seen.add(p.id);
    }
  }
  assert.equal(seen.size, 507);
  assert.equal((await query(undefined, { archived: true })).total, 1);
  for (const [filter, value] of Object.entries({
    clientId: id(99999),
    serviceTypeId: id(99999),
    stage: "arquivado",
    priority: "baixa",
    owner: "Outra equipe",
    financial: "pago",
  }))
    assert.equal((await query(undefined, { [filter]: value })).total, 0, filter);
  assert.equal(
    (
      await query(undefined, {
        clientId: client,
        stage: "exigencia",
        priority: "alta",
        financial: "pendente",
        serviceTypeId: id(19000),
      })
    ).total,
    1,
  );
  assert.equal((await query(undefined, { deadline: "sem_prazo" })).total, 0);
  assert.equal((await query("9999999")).total, 0);
  const recent = await query("0000041", { sort: "recent" });
  assert.equal(recent.items[0].id, caseId);
  const code = await query("0000041", { sort: "code" });
  assert.equal(code.items[0].code, "PROC-99");
  const today = (
    await db.query("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS value")
  ).rows[0].value;
  await db.exec(
    `RESET ROLE; UPDATE processes SET due_date='${today}'::date WHERE id='${caseId}'; SET ROLE authenticated;`,
  );
  assert.equal((await query(undefined, { deadline: "hoje" })).total, 1);
  assert.equal((await query(undefined, { deadline: "semana" })).total, 1);
  assert.equal((await query(undefined, { deadline: "atrasados" })).total, 0);
  for (const cnj of [null, "", "123456", "0000041%", "0000041' OR true--", "a".repeat(20)])
    await assert.rejects(() => query(cnj));
  for (const filters of [
    null,
    [],
    { page: -1 },
    { pageSize: 0 },
    { pageSize: 51 },
    { sort: "unknown" },
    { deadline: "unknown" },
  ])
    await assert.rejects(() => query(undefined, filters));
  await assert.rejects(() => query(undefined, {}, other), /ACCESS_DENIED/);
  for (const user of [external, inactive, ""]) {
    await db.exec(`SET test.actor='${user}'`);
    await assert.rejects(() => query(), /ACCESS_DENIED/);
  }
  await db.exec(`SET test.actor='${viewer}'`);
  assert.equal((await query()).total, 1);
  await db.exec(
    `RESET ROLE; UPDATE organization_settings SET enabled_modules='[]' WHERE organization_id='${org}'; SET ROLE authenticated;`,
  );
  await assert.rejects(() => query(), /ACCESS_DENIED/);
  await db.exec("SET ROLE anon");
  await assert.rejects(() => query(), /permission denied/);
  await db.exec("RESET ROLE");
  console.log(
    "Legal CNJ: full search, prefix, >500 matches, filters, stable pagination and access checks passed.",
  );
}
