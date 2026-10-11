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
const proposalSQL = readFileSync(
  new URL("../docs/operations/real-estate-proposals.sql", import.meta.url),
  "utf8",
);
await db.exec("RESET ROLE");
await db.exec(proposalSQL);
await db.exec("SET ROLE authenticated");
const property = id(30),
  interest = id(40),
  proposal = id(50);
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
  property,
  JSON.stringify(prop),
]);
await db.query("SELECT save_real_estate_interest($1,$2,NULL,$3)", [
  org,
  interest,
  JSON.stringify({
    property_id: property,
    client_id: owner,
    purpose: "venda",
    status: "novo",
    responsible_user_id: actor,
    notes: null,
  }),
]);
const base = {
  interest_id: interest,
  action: "aberta",
  amount: 240000,
  terms: "Entrada e financiamento",
  valid_until: "2100-01-01",
  party: "interessado",
  note: null,
};
const record = async (p, request, version, values, organization = org) =>
  (
    await db.query("SELECT record_real_estate_negotiation($1,$2,$3,$4,$5,$6) AS result", [
      organization,
      property,
      p,
      request,
      version,
      JSON.stringify(values),
    ])
  ).rows[0].result;
async function denied(promise, pattern) {
  await assert.rejects(promise, pattern);
}
const first = await record(proposal, id(60), null, base);
assert.equal(first.version, 1);
assert.equal(first.created_by, actor);
assert.deepEqual(await record(proposal, id(60), null, base), first);
await denied(record(proposal, id(60), null, { ...base, amount: 241000 }), /CONFLICT/);
await denied(record(id(51), id(61), null, base), /ALREADY_ACTIVE/);
await denied(record(id(52), id(62), null, { ...base, interest_id: otherOwner }), /foreign key/);
await denied(
  record(proposal, id(63), 1, { ...base, action: "aceita", note: null }),
  /NOTE_REQUIRED/,
);
await denied(
  record(proposal, id(64), 1, { ...base, action: "aceita", amount: 245000, note: "Confirmado" }),
  /TERMS_IMMUTABLE/,
);
await denied(
  record(proposal, id(65), 1, { ...base, action: "contraproposta", amount: 0 }),
  /check constraint/,
);
await denied(
  record(proposal, id(66), 1, { ...base, action: "contraproposta", amount: 245000.123 }),
  /check constraint/,
);
await denied(
  record(proposal, id(67), 1, { ...base, action: "contraproposta", valid_until: "2000-01-01" }),
  /EXPIRED/,
);
const counter = {
  ...base,
  action: "contraproposta",
  amount: 245000,
  party: "proprietario",
  terms: "Entrada de 50 mil; restante financiado",
};
assert.equal((await record(proposal, id(70), 1, counter)).status, "contraproposta");
await denied(
  record(proposal, id(71), 1, { ...counter, action: "aceita", note: "Confirmado" }),
  /CONFLICT/,
);
const accept = { ...counter, action: "aceita", note: "Confirmado pelo interessado por telefone" };
assert.equal((await record(proposal, id(72), 2, accept)).status, "aceita");
assert.equal((await record(proposal, id(72), 2, accept)).version, 3);
await denied(
  record(proposal, id(73), 3, { ...counter, action: "contraproposta" }),
  /TRANSITION_INVALID/,
);
await db.exec("RESET ROLE");
await db.query("INSERT INTO clients VALUES($1,$2,'Outro interessado',null)", [id(22), org]);
await db.exec("SET ROLE authenticated");
await db.query("SELECT save_real_estate_interest($1,$2,NULL,$3)", [
  org,
  id(41),
  JSON.stringify({
    property_id: property,
    client_id: id(22),
    purpose: "venda",
    status: "novo",
    responsible_user_id: actor,
    notes: null,
  }),
]);
const second = { ...base, interest_id: id(41) };
await record(id(55), id(80), null, second);
await denied(
  record(id(55), id(81), 1, { ...second, action: "aceita", note: "Confirmado" }),
  /ALREADY_ACCEPTED/,
);
assert.equal(
  (
    await record(proposal, id(74), 3, {
      ...counter,
      action: "cancelada",
      note: "Desistência antes do contrato",
    })
  ).status,
  "cancelada",
);
await denied(record(proposal, id(75), 4, { ...counter, action: "revisao" }), /TRANSITION_INVALID/);
assert.equal(
  (await record(id(55), id(81), 1, { ...second, action: "aceita", note: "Confirmado" })).status,
  "aceita",
);
await denied(
  db.query("DELETE FROM real_estate_proposal_events WHERE proposal_id=$1", [proposal]),
  /permission denied/,
);
await denied(
  db.query("UPDATE real_estate_proposal_events SET amount=1 WHERE proposal_id=$1", [proposal]),
  /permission denied/,
);
const list = async (status = null) =>
  (
    await db.query("SELECT list_real_estate_proposals($1,$2,$3,1) AS result", [
      org,
      property,
      status,
    ])
  ).rows[0].result;
assert.equal((await list()).total, 2);
assert.equal((await list("aceita")).total, 1);
const history = (
  await db.query("SELECT real_estate_proposal_history($1,$2,$3,1) AS result", [
    org,
    property,
    proposal,
  ])
).rows[0].result;
assert.equal(history.total, 4);
assert.equal(history.items[3].amount, 240000);
assert.equal(history.items[1].status, "aceita");
// Reaplicação mantém os registros e permissões.
await db.exec("RESET ROLE");
await db.exec(proposalSQL);
assert.equal(
  (await db.query("SELECT count(*) AS n FROM real_estate_proposal_events")).rows[0].n,
  6,
);
assert.equal(
  (
    await db.query(
      "SELECT count(*) AS n FROM audit_logs WHERE action LIKE 'real_estate.proposal_%'",
    )
  ).rows[0].n,
  6,
);
await db.exec("SET ROLE authenticated");
await record(id(56), id(100), null, base);
for (let version = 1; version <= 21; version++)
  await record(id(56), id(100 + version), version, {
    ...base,
    action: "revisao",
    terms: `Condições revisadas ${version}`,
  });
const page1 = (
  await db.query("SELECT real_estate_proposal_history($1,$2,$3,1) AS result", [
    org,
    property,
    id(56),
  ])
).rows[0].result;
const page2 = (
  await db.query("SELECT real_estate_proposal_history($1,$2,$3,2) AS result", [
    org,
    property,
    id(56),
  ])
).rows[0].result;
assert.equal(page1.total, 22);
assert.equal(page1.items.length, 20);
assert.equal(page2.items.length, 2);
assert.equal(page1.items[0].version, 22);
assert.equal(page2.items[1].version, 1);
await db.exec("RESET ROLE");
await db.query(
  "UPDATE real_estate_proposal_events SET valid_until='2000-01-01' WHERE proposal_id=$1 AND version=22",
  [id(56)],
);
await db.exec("SET ROLE authenticated");
assert.equal((await list("vencida")).total, 1);
assert.equal((await record(id(56), id(100), null, base)).version, 1);
const expired = { ...base, valid_until: "2000-01-01", terms: "Condições revisadas 21" };
await denied(
  record(id(56), id(125), 22, { ...expired, action: "aceita", note: "Confirmação tardia" }),
  /EXPIRED/,
);
assert.equal(
  (await record(id(56), id(126), 22, { ...expired, action: "recusada", note: "Prazo encerrado" }))
    .status,
  "recusada",
);
await denied(
  record(proposal, id(127), 4, { ...counter, action: "cancelada", note: "Outra empresa" }, other),
  /WRITE_DENIED/,
);
await db.exec(`SET ROLE authenticated; SET test.actor='${viewer}'`);
assert.equal((await list()).total, 3);
await denied(record(id(58), id(90), null, base), /WRITE_DENIED/);
await db.exec(`SET test.actor='${external}'`);
assert.equal((await db.query("SELECT * FROM real_estate_proposal_events")).rows.length, 0);
await denied(list(), /READ_DENIED/);
await db.exec(`SET test.actor='${id(13)}'`);
assert.equal((await db.query("SELECT * FROM real_estate_proposal_events")).rows.length, 0);
await denied(list(), /READ_DENIED/);
await db.exec("RESET ROLE; SET ROLE anon");
await denied(db.query("SELECT * FROM real_estate_proposals"), /permission denied/);
await denied(
  db.query("SELECT real_estate_proposal_options($1,$2)", [org, property]),
  /permission denied/,
);
await db.close();
console.log(
  "Propostas: histórico, transições, valores, conflitos, aceite exclusivo, repetição segura, RLS e reaplicação OK.",
);
