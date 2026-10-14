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
const proposalSQL = readFileSync(
  new URL("../docs/operations/real-estate-proposals.sql", import.meta.url),
  "utf8",
);
await db.exec("RESET ROLE");
await db.exec(proposalSQL);
await db.exec("SET ROLE authenticated");
await db.exec("RESET ROLE");
const contractSQL = readFileSync(
  new URL("../docs/operations/real-estate-contracts.sql", import.meta.url),
  "utf8",
);
await db.exec(contractSQL);
await db.exec("SET ROLE authenticated");
const property = id(30),
  interest = id(40),
  proposal = id(50),
  contract = id(60);
const prop = {
  code: "APTO",
  title: "Apartamento de teste",
  property_type: "apartamento",
  purpose: "locacao",
  status: "disponivel",
  owner_client_id: owner,
  responsible_user_id: actor,
  street: "Rua teste",
  city: "Anchieta",
  state: "ES",
  sale_price: null,
  rent_price: 1500,
};
await db.query("SELECT save_real_estate_property($1,$2,NULL,$3)", [
  org,
  property,
  JSON.stringify(prop),
]);
await db.query("SELECT save_real_estate_interest($1,$2,NULL,$3)", [
  org,
  interest,
  JSON.stringify({
    property_id: property,
    client_id: owner,
    purpose: "locacao",
    status: "novo",
    responsible_user_id: actor,
    notes: null,
  }),
]);
const proposalValues = {
  interest_id: interest,
  action: "aberta",
  amount: 1500,
  terms: "Aluguel mensal",
  valid_until: "2100-01-01",
  party: "interessado",
  note: null,
};
const negotiate = async (action, request, version) =>
  db.query("SELECT record_real_estate_negotiation($1,$2,$3,$4,$5,$6)", [
    org,
    property,
    proposal,
    request,
    version,
    JSON.stringify({
      ...proposalValues,
      action,
      note: action === "aberta" ? null : "Confirmado em teste",
    }),
  ]);
await negotiate("aberta", id(51), null);
const contractValues = {
  reference: "CT-001",
  action: "criado",
  amount: 1500,
  terms: "Aluguel mensal",
  starts_on: "2026-10-13",
  ends_on: "2099-01-01",
  note: "Documento conferido",
};
const record = async (cid, request, version, v, organization = org, pid = proposal) =>
  (
    await db.query("SELECT record_real_estate_contract($1,$2,$3,$4,$5,$6,$7) AS result", [
      organization,
      property,
      cid,
      pid,
      request,
      version,
      JSON.stringify(v),
    ])
  ).rows[0].result;
const denied = async (promise, pattern) => assert.rejects(promise, pattern);
await negotiate("aceita", id(52), 1);
await record(contract, id(70), null, contractValues);
await db.exec("RESET ROLE");
const settlementSQL = readFileSync(
  new URL("../docs/operations/real-estate-settlements.sql", import.meta.url),
  "utf8",
);
await db.exec(settlementSQL);
await db.exec("SET ROLE authenticated");
const today = (
  await db.query("SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date,'YYYY-MM-DD') AS d")
).rows[0].d;
const base = {
  reference: "2026-10",
  owner_client_id: owner,
  gross: 1500,
  commission_type: "percentual",
  commission_value: 10,
  due_on: "2026-10-20",
  action: "criado",
  occurred_on: null,
  note: "Previsão de teste",
};
const settlement = id(300);
const save = async (s, request, version, v, organization = org) =>
  (
    await db.query("SELECT record_real_estate_settlement($1,$2,$3,$4,$5,$6,$7) AS result", [
      organization,
      property,
      s,
      contract,
      request,
      version,
      JSON.stringify(v),
    ])
  ).rows[0].result;
const list = async (status = null, page = 1) =>
  (
    await db.query("SELECT list_real_estate_settlements($1,NULL,$2,$3) AS result", [
      org,
      status,
      page,
    ])
  ).rows[0].result;
const options = (await db.query("SELECT real_estate_settlement_options($1,NULL) AS result", [org]))
  .rows[0].result;
assert.equal(options.length, 1);
assert.equal(options[0].owner_client_id, owner);
for (const patch of [
  { gross: 0 },
  { gross: -1 },
  { gross: 1500.123 },
  { commission_value: 101 },
  { commission_type: "fixa", commission_value: 1501 },
  { note: " " },
])
  await denied(save(settlement, id(301), null, { ...base, ...patch }), /check constraint/);
await denied(
  save(settlement, id(301), null, { ...base, owner_client_id: otherOwner }),
  /OWNER_INVALID/,
);
await denied(save(settlement, id(301), null, { ...base, reference: "2026-09" }), /PERIOD_INVALID/);
await denied(
  save(settlement, id(301), null, { ...base, action: "repassado", occurred_on: today }),
  /TRANSITION_INVALID/,
);
const first = await save(settlement, id(301), null, base);
assert.equal(first.created_by, actor);
assert.deepEqual(await save(settlement, id(301), null, base), first);
await denied(save(settlement, id(301), null, { ...base, gross: 1600 }), /CONFLICT/);
await denied(save(id(302), id(303), null, base), /DUPLICATE/);
assert.equal((await list()).items[0].commission_amount, 150);
assert.equal((await list()).items[0].owner_amount, 1350);
assert.deepEqual((await list()).totals, {
  commission_received: 0,
  owner_pending: 0,
  owner_paid: 0,
});
await denied(
  save(settlement, id(304), 1, { ...base, action: "repassado", occurred_on: today }),
  /TRANSITION_INVALID/,
);
await denied(
  save(settlement, id(304), 1, { ...base, action: "recebido", occurred_on: "2100-01-01" }),
  /DATE_INVALID/,
);
const received = { ...base, action: "recebido", occurred_on: today, note: "Recebimento conferido" };
assert.equal((await save(settlement, id(304), 1, received)).status, "recebido");
assert.deepEqual((await list()).totals, {
  commission_received: 150,
  owner_pending: 1350,
  owner_paid: 0,
});
await denied(save(settlement, id(305), 1, received), /CONFLICT/);
await denied(save(settlement, id(305), 2, { ...base, action: "cancelado" }), /TRANSITION_INVALID/);
await denied(
  save(settlement, id(305), 2, { ...base, action: "repassado", occurred_on: "2000-01-01" }),
  /DATE_INVALID/,
);
// Defesa do INSERT direto e da alteração retroativa.
await denied(
  db.query(
    "INSERT INTO real_estate_settlement_events(id,organization_id,property_id,settlement_id,version,action,status,occurred_on,note,created_by) VALUES($1,$2,$3,$4,3,'criado','previsto',NULL,'Tentativa direta',$5)",
    [id(400), org, property, settlement, actor],
  ),
  /TRANSITION_INVALID/,
);
await denied(db.query("UPDATE real_estate_settlements SET gross=1"), /permission denied/);
await denied(db.query("DELETE FROM real_estate_settlement_events"), /permission denied/);
const paid = {
  ...base,
  action: "repassado",
  occurred_on: today,
  note: "Transferência de teste conferida",
};
assert.equal((await save(settlement, id(306), 2, paid)).status, "repassado");
assert.equal((await save(settlement, id(306), 2, paid)).version, 3);
assert.deepEqual((await list()).totals, {
  commission_received: 150,
  owner_pending: 0,
  owner_paid: 1350,
});
await denied(save(settlement, id(307), 3, paid), /TRANSITION_INVALID/);
assert.equal(
  (
    await db.query("SELECT real_estate_settlement_history($1,$2,$3,1) AS result", [
      org,
      property,
      settlement,
    ])
  ).rows[0].result.total,
  3,
);
// Cancelar uma previsão permite criar uma substituta na mesma competência.
const next = { ...base, reference: "2026-11", commission_type: "fixa", commission_value: 200 };
await save(id(310), id(311), null, next);
await save(id(310), id(312), 1, {
  ...next,
  action: "cancelado",
  note: "Correção antes de receber",
});
await save(id(313), id(314), null, next);
assert.equal((await list()).total, 3);
assert.equal((await list("cancelado")).total, 1);
await db.exec("RESET ROLE");
await db.exec(settlementSQL);
await db.exec("SET ROLE authenticated");
assert.equal((await list()).total, 3);
// Os indicadores independem do filtro e da paginação.
assert.equal((await list("cancelado")).totals.owner_paid, 1350);
for (let n = 0; n < 21; n++)
  await save(id(500 + n), id(600 + n), null, {
    ...base,
    reference: `2027-${String((n % 12) + 1).padStart(2, "0")}`,
    note: "Paginação",
  }).catch(async (error) => {
    if (!String(error).includes("DUPLICATE")) throw error;
    await save(id(500 + n), id(600 + n), null, {
      ...base,
      reference: `2028-${String((n % 12) + 1).padStart(2, "0")}`,
      note: "Paginação",
    });
  });
assert.equal((await list()).items.length, 20);
assert.equal((await list(null, 2)).items.length, 4);
await denied(save(id(700), id(701), null, base, other), /WRITE_DENIED/);
await db.exec(`SET test.actor='${viewer}'`);
assert.equal((await list()).total, 24);
await denied(save(id(702), id(703), null, base), /WRITE_DENIED/);
await db.exec(`SET test.actor='${external}'`);
await denied(list(), /READ_DENIED/);
assert.equal((await db.query("SELECT * FROM real_estate_settlements")).rows.length, 0);
await db.exec(`SET test.actor='${id(13)}'`);
await denied(list(), /READ_DENIED/);
assert.equal((await db.query("SELECT * FROM real_estate_settlement_events")).rows.length, 0);
await db.exec("RESET ROLE");
await db.query(
  "INSERT INTO organization_members VALUES($1,$2,'financeiro',true),($1,$3,'operacional',true)",
  [org, id(800), id(801)],
);
await db.exec(`SET ROLE authenticated; SET test.actor='${id(800)}'`);
await save(id(802), id(803), null, { ...base, reference: "2029-01" });
// Financeiro registra demonstrativos, mas continua sem editar imóveis.
assert.equal(
  (
    await db.query(
      "UPDATE real_estate_properties SET title='Alteração proibida' WHERE id=$1 RETURNING id",
      [property],
    )
  ).rows.length,
  0,
);
await db.exec(`SET test.actor='${id(801)}'`);
await denied(save(id(804), id(805), null, { ...base, reference: "2029-02" }), /WRITE_DENIED/);
await db.exec(`SET test.actor='${actor}'`);
await record(contract, id(900), 1, {
  ...contractValues,
  action: "encerrado",
  note: "Encerramento de teste",
});
const closedOptions = (await db.query("SELECT real_estate_settlement_options($1) AS result", [org]))
  .rows[0].result;
assert.equal(closedOptions[0].contract_status, "encerrado");
assert.equal(closedOptions[0].ends_on, today);
await denied(save(id(901), id(902), null, { ...base, reference: "2030-01" }), /PERIOD_INVALID/);
// Um encerramento não impede liquidar valores de competência anterior.
await save(id(903), id(904), null, {
  ...base,
  reference: "2026-10",
  note: "Histórico após encerramento",
  action: "criado",
}).catch((error) => {
  if (!String(error).includes("DUPLICATE")) throw error;
});
await db.exec("RESET ROLE; SET ROLE anon");
await denied(db.query("SELECT * FROM real_estate_settlements"), /permission denied/);
await denied(db.query("SELECT real_estate_settlement_options($1)", [org]), /permission denied/);
await db.exec("RESET ROLE");
assert.equal(
  (
    await db.query(
      "SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('record_real_estate_settlement','list_real_estate_settlements','real_estate_settlement_options','real_estate_settlement_history','real_estate_settlement_access') AND NOT p.prosecdef AND NOT has_function_privilege('anon',p.oid,'EXECUTE')",
    )
  ).rows[0].n,
  5,
);
await db.close();
console.log(
  "Comissões/repasses: centavos, vínculos, recebimento antes do repasse, datas, histórico, repetição, conflitos, cancelamento, paginação e RLS OK.",
);
