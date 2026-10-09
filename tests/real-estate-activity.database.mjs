import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve(process.env.FLUXA_PGLITE_ROOT || ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const org = id(1),
  other = id(2),
  actor = id(10),
  viewer = id(11),
  external = id(12),
  owner = id(20),
  otherOwner = id(21);
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TYPE app_role AS ENUM ('superadmin','proprietario','administrador','gestor','operacional','atendimento','financeiro','visualizador','cliente_externo');
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE organization_settings(organization_id uuid PRIMARY KEY,business_segment text,enabled_modules jsonb);
CREATE TABLE organization_members(organization_id uuid,user_id uuid,role app_role,is_active boolean,UNIQUE(organization_id,user_id));
CREATE TABLE clients(id uuid PRIMARY KEY,organization_id uuid,name text,archived_at timestamptz,UNIQUE(organization_id,id));
CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text);
CREATE TABLE audit_logs(organization_id uuid,actor_id uuid,action text,entity text,entity_id uuid,metadata jsonb);
CREATE FUNCTION has_org_role(org uuid,roles app_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=org AND user_id=auth.uid() AND is_active AND role=ANY(roles)); $$;
GRANT SELECT ON organization_settings,organization_members,clients,profiles TO authenticated;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_read ON clients TO authenticated USING(has_org_role(organization_id,enum_range(NULL::app_role)));
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_read ON organization_settings TO authenticated USING(has_org_role(organization_id,enum_range(NULL::app_role)));
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON organization_members TO authenticated USING(has_org_role(organization_id,enum_range(NULL::app_role)));
INSERT INTO organizations VALUES('${org}'),('${other}');
INSERT INTO organization_settings VALUES('${org}','real_estate','["real_estate_workspace"]'),('${other}','real_estate','[]');
INSERT INTO organization_members VALUES('${org}','${actor}','proprietario',true),('${org}','${viewer}','visualizador',true),('${org}','${external}','cliente_externo',true),('${other}','${id(13)}','proprietario',true);
INSERT INTO clients VALUES('${owner}','${org}','Proprietário Teste',null),('${otherOwner}','${other}','Outra empresa',null);
INSERT INTO profiles VALUES('${actor}','Responsável Teste');
SET test.actor='${actor}';
`);
const sql = readFileSync(
  new URL("../docs/operations/real-estate-foundation.sql", import.meta.url),
  "utf8",
);
await db.exec(sql);
const activitySQL = readFileSync(
  new URL("../docs/operations/real-estate-activity.sql", import.meta.url),
  "utf8",
);
await db.exec(activitySQL);
await db.exec("SET ROLE authenticated");
const prop = {
  code: "CASA",
  title: "Casa teste",
  property_type: "casa",
  purpose: "venda",
  status: "disponivel",
  owner_client_id: owner,
  responsible_user_id: actor,
  street: "Rua teste",
  city: "Anchieta",
  state: "ES",
  sale_price: 250000,
  rent_price: null,
};
await db.query("SELECT save_real_estate_property($1,$2,NULL,$3)", [
  org,
  id(30),
  JSON.stringify(prop),
]);
await db.query("SELECT save_real_estate_property($1,$2,NULL,$3)", [
  org,
  id(31),
  JSON.stringify({ ...prop, code: "CASA-2" }),
]);
const interest = {
  property_id: id(30),
  client_id: owner,
  purpose: "venda",
  status: "novo",
  responsible_user_id: actor,
  notes: "  Interesse de teste  ",
};
async function save(kind, n, v, values, o = org) {
  return (
    await db.query(`SELECT save_real_estate_${kind}($1,$2,$3,$4) AS r`, [
      o,
      id(n),
      v,
      JSON.stringify(values),
    ])
  ).rows[0].r;
}
async function list(kind, property = id(30), status = null, page = 1, o = org) {
  return (
    await db.query("SELECT list_real_estate_activity($1,$2,$3,$4,$5) AS r", [
      o,
      property,
      kind,
      status,
      page,
    ])
  ).rows[0].r;
}
const created = await save("interest", 40, null, interest);
assert.equal(created.version, 1);
assert.equal(created.notes, "Interesse de teste");
assert.equal((await save("interest", 40, null, interest)).version, 1);
await assert.rejects(save("interest", 40, null, { ...interest, notes: "diferente" }), /CONFLICT/);
await assert.rejects(save("interest", 41, null, interest), /duplicate key/);
await assert.rejects(
  save("interest", 41, null, { ...interest, client_id: otherOwner }),
  /CLIENT_INVALID|foreign key/,
);
await assert.rejects(
  save("interest", 41, null, { ...interest, purpose: "locacao" }),
  /PURPOSE_INVALID/,
);
await assert.rejects(
  save("interest", 41, null, { ...interest, responsible_user_id: viewer, client_id: otherOwner }),
  /RESPONSIBLE_INVALID/,
);
assert.equal((await list("interests")).items[0].client_name, "Proprietário Teste");
assert.equal((await list("interests", id(31))).total, 0);
assert.equal((await save("interest", 40, 1, { ...interest, status: "em_contato" })).version, 2);
await assert.rejects(save("interest", 40, 1, interest), /CONFLICT/);
await assert.rejects(save("interest", 40, 2, { ...interest, property_id: id(31) }), /IMMUTABLE/);
const future = new Date(Date.now() + 86400000);
future.setUTCSeconds(0, 0);
const at = (minutes) => new Date(future.getTime() + minutes * 60000).toISOString();
const visit = {
  property_id: id(30),
  interest_id: id(40),
  responsible_user_id: actor,
  starts_at: at(0),
  ends_at: at(60),
  status: "agendada",
  notes: "Visita teste",
  outcome: null,
};
assert.equal((await save("visit", 50, null, visit)).version, 1);
await save("interest", 41, null, { ...interest, property_id: id(31) });
await assert.rejects(
  save("visit", 54, null, { ...visit, property_id: id(31), interest_id: id(41) }),
  /OVERLAP/,
); // conflito entre imóveis diferentes
assert.equal((await save("visit", 50, null, visit)).version, 1);
await assert.rejects(
  save("visit", 51, null, { ...visit, starts_at: at(30), ends_at: at(90) }),
  /OVERLAP/,
);
await assert.rejects(
  save("visit", 51, null, { ...visit, starts_at: at(60), ends_at: at(65) }),
  /check constraint/,
);
await assert.rejects(
  save("visit", 51, null, { ...visit, starts_at: at(60), ends_at: at(360) }),
  /check constraint/,
);
await assert.rejects(
  save("visit", 51, null, {
    ...visit,
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    ends_at: new Date(Date.now() - 1800000).toISOString(),
  }),
  /FUTURE/,
);
await assert.rejects(
  save("visit", 51, null, { ...visit, property_id: id(31) }),
  /INTEREST_INVALID/,
);
await assert.rejects(
  save("visit", 51, null, { ...visit, status: "realizada", outcome: "Concluída" }),
  /NOT_STARTED/,
);
await assert.rejects(
  save("visit", 51, null, { ...visit, status: "cancelada" }),
  /check constraint/,
);
await assert.rejects(
  save("visit", 51, null, { ...visit, responsible_user_id: viewer }),
  /RESPONSIBLE_INVALID/,
);
assert.equal(
  (await save("visit", 51, null, { ...visit, starts_at: at(60), ends_at: at(120) })).version,
  1,
); // horário contíguo permitido
const moved = await save("visit", 50, 1, { ...visit, starts_at: at(180), ends_at: at(240) });
assert.equal(moved.version, 2);
await assert.rejects(save("visit", 50, 1, visit), /CONFLICT/);
const cancelled = await save("visit", 50, 2, {
  ...visit,
  starts_at: at(180),
  ends_at: at(240),
  status: "cancelada",
  outcome: "Cliente pediu outro dia",
});
assert.equal(cancelled.version, 3);
assert.equal((await list("visits", id(30), "cancelada")).total, 1);
const past = {
  ...visit,
  starts_at: new Date(Date.now() - 7200000).toISOString(),
  ends_at: new Date(Date.now() - 3600000).toISOString(),
  status: "realizada",
  outcome: "Cliente gostou do imóvel",
};
await save("visit", 52, null, past);
assert.equal((await list("visits", id(30), "realizada")).total, 1);
assert.equal((await list("visits")).total, 3);
assert.equal((await list("visits")).items.find((v) => v.id === id(52)).client_id, owner);
await save("interest", 40, 2, { ...interest, status: "encerrado" });
await assert.rejects(
  save("visit", 53, null, { ...visit, starts_at: at(300), ends_at: at(360) }),
  /PROPERTY_CLOSED/,
);
await save("interest", 40, 3, { ...interest, status: "visitando" });
await db.query("SELECT save_real_estate_property($1,$2,1,$3)", [
  org,
  id(30),
  JSON.stringify({ ...prop, status: "vendido" }),
]);
await assert.rejects(
  save("visit", 53, null, { ...visit, starts_at: at(300), ends_at: at(360) }),
  /PROPERTY_CLOSED/,
);
// Finalizar um registro histórico permanece permitido após fechamento do imóvel.
await save("visit", 51, 1, {
  ...visit,
  starts_at: at(60),
  ends_at: at(120),
  status: "cancelada",
  outcome: "Venda concluída",
});
await db.exec(`RESET ROLE; SET test.actor='${viewer}'; SET ROLE authenticated;`);
assert.equal((await list("interests")).total, 1);
assert.equal((await list("visits")).total, 3);
await assert.rejects(save("interest", 60, null, interest), /WRITE_DENIED/);
await db.query("UPDATE real_estate_interests SET status=$1 WHERE id=$2", ["novo", id(40)]);
assert.equal((await list("interests")).items[0].status, "visitando"); // escrita silenciosa negada pela RLS
await assert.rejects(db.query("DELETE FROM real_estate_visits"), /permission denied/);
await db.exec(`RESET ROLE; SET test.actor='${external}'; SET ROLE authenticated;`);
await assert.rejects(
  db.query(
    "INSERT INTO real_estate_interests(id,organization_id,property_id,client_id,purpose,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7)",
    [id(61), org, id(30), owner, "venda", "novo", external],
  ),
  /WRITE_DENIED|row-level security/,
);
await assert.rejects(list("interests"), /READ_DENIED/);
assert.equal((await db.query("SELECT * FROM real_estate_visits")).rows.length, 0);
await db.exec(`RESET ROLE; SET test.actor='${actor}'; SET ROLE authenticated;`);
await assert.rejects(
  db.query("UPDATE real_estate_visits SET organization_id=$1 WHERE id=$2", [other, id(50)]),
  /IMMUTABLE|WRITE_DENIED/,
);
await assert.rejects(list("visits", id(30), null, 1, other), /READ_DENIED/);
await assert.rejects(save("interest", 60, null, interest, other), /WRITE_DENIED/);
await assert.rejects(list("interests", id(30), null, 0), /INVALID/);
await db.exec(
  `RESET ROLE;UPDATE organization_settings SET enabled_modules='["clients"]' WHERE organization_id='${org}';SET ROLE authenticated;`,
);
await assert.rejects(list("visits"), /READ_DENIED/);
await db.exec(
  `RESET ROLE;UPDATE organization_settings SET enabled_modules='[]',business_segment='health' WHERE organization_id='${org}';SET ROLE authenticated;`,
);
await assert.rejects(list("visits"), /READ_DENIED/);
await db.exec(
  `RESET ROLE;UPDATE organization_settings SET business_segment='real_estate' WHERE organization_id='${org}';`,
);
for (const table of ["real_estate_interests", "real_estate_visits"]) {
  assert.equal(
    (await db.query(`SELECT has_table_privilege('anon','${table}','SELECT') p`)).rows[0].p,
    false,
  );
  assert.equal(
    (await db.query(`SELECT has_table_privilege('authenticated','${table}','DELETE') p`)).rows[0].p,
    false,
  );
  assert.equal(
    (await db.query(`SELECT count(*)::int n FROM pg_policies WHERE tablename='${table}'`)).rows[0]
      .n,
    3,
  );
}
for (const fn of [
  "save_real_estate_interest(uuid,uuid,bigint,jsonb)",
  "save_real_estate_visit(uuid,uuid,bigint,jsonb)",
  "list_real_estate_activity(uuid,uuid,text,text,integer)",
])
  assert.equal(
    (await db.query(`SELECT has_function_privilege('anon','public.${fn}','EXECUTE') p`)).rows[0].p,
    false,
  );
const verify = await db.query(
  readFileSync(
    new URL("../docs/operations/real-estate-activity-verify.sql", import.meta.url),
    "utf8",
  ),
);
assert.equal(verify.rows.length, 2);
for (const row of verify.rows) {
  assert.equal(row.rls, true);
  assert.equal(Number(row.politicas), 3);
  assert.equal(row.anon_pode_ler, false);
  assert.equal(row.usuario_pode_excluir, false);
  assert.equal(row.gravacao_respeita_rls, true);
  assert.equal(row.anon_pode_gravar, false);
}
await db.exec(activitySQL); // reaplicação preserva todos os dados e os vínculos
assert.equal((await db.query("SELECT count(*)::int n FROM real_estate_visits")).rows[0].n, 3);
assert.ok(
  (await db.query("SELECT count(*)::int n FROM audit_logs WHERE action LIKE 'real_estate.visit_%'"))
    .rows[0].n >= 6,
);
await db.exec("SET ROLE authenticated");
for (let n = 100; n < 125; n++) await save("visit", n, null, { ...past, notes: `Visita ${n}` });
assert.equal((await list("visits")).total, 28);
assert.equal((await list("visits")).items.length, 20);
assert.equal((await list("visits", id(30), null, 2)).items.length, 8);
console.log(
  "PASS: interessados e visitas — RLS real, acesso por empresa/área/perfil, vínculos, criação repetida, duplicidade, horários, sobreposição, reagendamento, resultado, finalização, versões, filtros, paginação, auditoria e reaplicação.",
);
await db.close();
