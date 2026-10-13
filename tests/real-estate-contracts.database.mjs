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
const values = {
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
await denied(record(contract, id(70), null, values), /ACCEPTED_REQUIRED/);
await negotiate("aceita", id(52), 1);
await denied(record(contract, id(70), null, { ...values, amount: 1600 }), /ACCEPTED_TERMS/);
await denied(record(contract, id(70), null, { ...values, ends_on: null }), /END_REQUIRED/);
await denied(
  record(contract, id(70), null, { ...values, ends_on: "2000-01-01" }),
  /check constraint/,
);
await denied(record(contract, id(70), null, { ...values, note: " " }), /check constraint/);
const first = await record(contract, id(70), null, values);
assert.equal(first.version, 1);
assert.equal(first.created_by, actor);
assert.deepEqual(await record(contract, id(70), null, values), first);
await denied(record(contract, id(70), null, { ...values, note: "Outro" }), /CONFLICT/);
await denied(record(id(61), id(71), null, { ...values, reference: "CT-002" }), /unique constraint/);
await denied(negotiate("cancelada", id(53), 2), /ACTIVE_PROPOSAL/);
await denied(
  record(contract, id(72), 1, { ...values, action: "renovado", ends_on: "2098-01-01" }),
  /RENEWAL_INVALID/,
);
await denied(
  record(contract, id(72), 1, {
    ...values,
    action: "renovado",
    starts_on: "2026-10-14",
    ends_on: "2100-01-01",
  }),
  /RENEWAL_INVALID/,
);
const renewal = {
  ...values,
  action: "renovado",
  amount: 1600,
  terms: "Reajuste mensal confirmado",
  ends_on: "2100-01-01",
  note: "Renovação conferida",
};
assert.equal((await record(contract, id(72), 1, renewal)).version, 2);
assert.equal((await record(contract, id(72), 1, renewal)).amount, 1600);
await denied(record(contract, id(73), 1, renewal), /CONFLICT/);
await denied(
  record(contract, id(74), 2, { ...renewal, action: "encerrado", amount: 2000 }),
  /TERMS_IMMUTABLE/,
);
const list = async (status = null, organization = org, page = 1) =>
  (
    await db.query("SELECT list_real_estate_contracts($1,NULL,$2,$3) AS result", [
      organization,
      status,
      page,
    ])
  ).rows[0].result;
assert.equal((await list()).total, 1);
assert.equal(
  (await db.query("SELECT real_estate_contract_options($1,$2) AS result", [org, property])).rows[0]
    .result.length,
  0,
);
const history = async (page = 1) =>
  (
    await db.query("SELECT real_estate_contract_history($1,$2,$3,$4) AS result", [
      org,
      property,
      contract,
      page,
    ])
  ).rows[0].result;
assert.equal((await history()).items[1].amount, 1500);
assert.equal((await history()).items[0].amount, 1600);
// Reaplicação não apaga os registros.
await db.exec("RESET ROLE");
await db.exec(contractSQL);
await db.exec("SET ROLE authenticated");
assert.equal((await history()).total, 2);
// Boundary do dia em Brasília: vencimento é indicador, não grava novo evento.
await db.exec("RESET ROLE");
await db.exec(
  "UPDATE real_estate_contract_events SET starts_on='2000-01-01',ends_on=(now() AT TIME ZONE 'America/Sao_Paulo')::date WHERE contract_id='" +
    contract +
    "' AND version=2",
);
await db.exec("SET ROLE authenticated");
assert.equal((await list("a_vencer")).total, 1);
assert.equal((await list("vencido")).total, 0);
await db.exec("RESET ROLE");
await db.exec(
  "UPDATE real_estate_contract_events SET ends_on=(now() AT TIME ZONE 'America/Sao_Paulo')::date-1 WHERE contract_id='" +
    contract +
    "' AND version=2",
);
await db.exec("SET ROLE authenticated");
assert.equal((await list("vencido")).total, 1);
assert.equal((await list("ativo")).total, 1);
await db.exec("RESET ROLE");
await db.query(
  "UPDATE real_estate_contract_events SET starts_on=$1,ends_on=$2 WHERE contract_id=$3 AND version=2",
  [renewal.starts_on, renewal.ends_on, contract],
);
await db.exec("SET ROLE authenticated");
for (let version = 2; version <= 22; version++)
  await record(contract, id(100 + version), version, {
    ...renewal,
    ends_on: `2100-01-${String(version).padStart(2, "0")}`,
    note: `Renovação ${version}`,
  });
assert.equal((await history()).total, 23);
assert.equal((await history()).items.length, 20);
assert.equal((await history(2)).items.length, 3);
const final = { ...renewal, ends_on: "2100-01-22", action: "encerrado", note: "Fim da locação" };
assert.equal((await record(contract, id(150), 23, final)).status, "encerrado");
await denied(
  record(contract, id(151), 24, { ...final, action: "renovado", ends_on: "2100-02-01" }),
  /TRANSITION_INVALID/,
);
await negotiate("cancelada", id(53), 2);
assert.equal((await record(contract, id(70), null, values)).version, 1);
await denied(db.query("UPDATE real_estate_contract_events SET amount=1"), /permission denied/);
await denied(db.query("DELETE FROM real_estate_contracts"), /permission denied/);
await denied(record(contract, id(152), 24, final, other), /WRITE_DENIED/);
await db.exec(`SET test.actor='${viewer}'`);
assert.equal((await list()).total, 1);
await denied(record(id(62), id(153), null, values), /WRITE_DENIED/);
await db.exec(`SET test.actor='${external}'`);
await denied(list(), /READ_DENIED/);
assert.equal((await db.query("SELECT * FROM real_estate_contract_events")).rows.length, 0);
await db.exec(`SET test.actor='${id(13)}'`);
await denied(list(), /READ_DENIED/);
assert.equal((await db.query("SELECT * FROM real_estate_contracts")).rows.length, 0);
await db.exec("RESET ROLE; SET ROLE anon");
await denied(db.query("SELECT * FROM real_estate_contracts"), /permission denied/);
await denied(db.query("SELECT list_real_estate_contracts($1)", [org]), /permission denied/);
await db.exec("RESET ROLE");
assert.equal(
  (
    await db.query(
      "SELECT count(*) AS n FROM audit_logs WHERE action LIKE 'real_estate.contract_%'",
    )
  ).rows[0].n,
  24,
);
assert.equal(
  (
    await db.query(
      "SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('record_real_estate_contract','list_real_estate_contracts','real_estate_contract_options','real_estate_contract_history') AND NOT p.prosecdef AND NOT has_function_privilege('anon',p.oid,'EXECUTE')",
    )
  ).rows[0].n,
  4,
);
await db.close();
console.log(
  "Contratos: aceite, termos, histórico, renovação, encerramento, repetição segura, vencimentos, RLS e reaplicação OK.",
);
