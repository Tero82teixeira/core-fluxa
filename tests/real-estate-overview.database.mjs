import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve(process.env.FLUXA_PGLITE_ROOT || ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { verifyRealEstateNotifications } from "./real-estate-notifications.database.mjs";
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
  title: "Apartamento 100% Seguro",
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
  starts_on: (
    await db.query(
      "SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date-30,'YYYY-MM-DD') AS d",
    )
  ).rows[0].d,
  ends_on: (
    await db.query(
      "SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date+5,'YYYY-MM-DD') AS d",
    )
  ).rows[0].d,
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
await db.exec("RESET ROLE");
const overviewSQL = readFileSync(
  new URL("../docs/operations/real-estate-overview.sql", import.meta.url),
  "utf8",
);
assert.equal(
  overviewSQL,
  readFileSync(
    new URL("../supabase/migrations/20261016173751_real_estate_overview.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec(overviewSQL);
// Reaplicação idempotente.
await db.exec(overviewSQL);
await db.exec(`INSERT INTO clients VALUES('${id(80)}','${org}','Locatário pendente',null)`);
await db.exec("SET ROLE authenticated");
await db.query("SELECT save_real_estate_interest($1,$2,NULL,$3)", [
  org,
  id(81),
  JSON.stringify({
    property_id: property,
    client_id: id(80),
    purpose: "locacao",
    status: "novo",
    responsible_user_id: actor,
    notes: null,
  }),
]);
await db.query("SELECT record_real_estate_negotiation($1,$2,$3,$4,NULL,$5)", [
  org,
  property,
  id(82),
  id(83),
  JSON.stringify({ ...proposalValues, interest_id: id(81) }),
]);
const yesterday = (
  await db.query(
    "SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date-1,'YYYY-MM-DD') AS d",
  )
).rows[0].d;
const values = {
  reference: today.slice(0, 7),
  owner_client_id: owner,
  gross: 100,
  commission_type: "percentual",
  commission_value: 10,
  due_on: yesterday,
  action: "criado",
  occurred_on: null,
  note: "Teste de visão geral",
};
async function saveSettlement(action, version, request) {
  return db.query("SELECT record_real_estate_settlement($1,$2,$3,$4,$5,$6,$7)", [
    org,
    property,
    id(300),
    contract,
    request,
    version,
    JSON.stringify({ ...values, action, occurred_on: action === "recebido" ? yesterday : null }),
  ]);
}
await saveSettlement("criado", null, id(301));
await saveSettlement("recebido", 1, id(302));
const overview = async (
  search = null,
  kind = null,
  scope = "pendencias",
  page = 1,
  organization = org,
) =>
  (
    await db.query("SELECT real_estate_overview($1,$2,$3,$4,$5) AS result", [
      organization,
      search,
      kind,
      scope,
      page,
    ])
  ).rows[0].result;
const pending = await overview();
assert.deepEqual(pending.counts, { proposta: 1, contrato: 1, repasse: 1 });
assert.equal(pending.total, 3);
assert.deepEqual(
  new Set(pending.items.map((i) => i.kind)),
  new Set(["proposta", "contrato", "repasse"]),
);
const proposalItem = pending.items.find((i) => i.kind === "proposta");
assert.equal(proposalItem.data.id, id(82));
assert.equal(proposalItem.property.id, property);
assert.equal(proposalItem.data.status, "aberta");
const contractItem = pending.items.find((i) => i.kind === "contrato");
assert.equal(contractItem.data.id, contract);
assert.equal(contractItem.data.display_status, "a_vencer");
const settlementItem = pending.items.find((i) => i.kind === "repasse");
assert.equal(settlementItem.data.id, id(300));
assert.equal(settlementItem.data.display_status, "atrasado");
assert.equal(settlementItem.data.owner_amount, 90);
assert.equal((await overview("ct-001", null, "todos")).total, 2);
assert.equal((await overview("locatário", null, "todos")).total, 1);
assert.equal((await overview("%", "imovel", "todos")).total, 1);
assert.equal((await overview("inexistente", null, "todos")).total, 0);
assert.deepEqual((await overview("inexistente")).counts, pending.counts);
// Uma decisão retira a proposta da fila, sem apagar o histórico pesquisável.
await db.query("SELECT record_real_estate_negotiation($1,$2,$3,$4,1,$5)", [
  org,
  property,
  id(82),
  id(84),
  JSON.stringify({
    ...proposalValues,
    interest_id: id(81),
    action: "recusada",
    note: "Recusa de teste",
  }),
]);
assert.equal((await overview()).counts.proposta, 0);
assert.equal((await overview("locatário", "proposta", "todos")).items[0].data.status, "recusada");
// Paginação real e contagem fora da página, sem mistura de empresas.
for (let n = 0; n < 23; n++)
  await db.query("SELECT save_real_estate_property($1,$2,NULL,$3)", [
    org,
    id(1000 + n),
    JSON.stringify({ ...prop, code: `PAG-${n}` }),
  ]);
const first = await overview(null, "imovel", "todos", 1),
  second = await overview(null, "imovel", "todos", 2);
assert.equal(first.total, 24);
assert.equal(first.items.length, 20);
assert.equal(second.items.length, 4);
assert.equal(new Set([...first.items, ...second.items].map((i) => i.id)).size, 24);
await denied(overview(null, null, "pendencias", 0), /INVALID/);
await denied(overview("a".repeat(121)), /INVALID/);
await denied(overview(null, "invalid"), /INVALID/);
await denied(overview(null, null, "invalid"), /INVALID/);
await denied(overview(null, null, "todos", 1, other), /READ_DENIED/);
await db.exec(`SET test.actor='${viewer}'`);
assert.equal((await overview(null, "imovel", "todos")).total, 24);
await db.exec(`SET test.actor='${external}'`);
await denied(overview(), /READ_DENIED/);
await db.exec(`SET test.actor='${id(13)}'`);
assert.equal((await overview(null, null, "todos", 1, other)).total, 0);
await denied(overview(), /READ_DENIED/);
await db.exec("RESET ROLE; SET ROLE anon");
await denied(overview(), /permission denied/);
await db.exec("RESET ROLE");
assert.equal(
  (
    await db.query(
      "SELECT NOT prosecdef AS invoker FROM pg_proc WHERE proname='real_estate_overview'",
    )
  ).rows[0].invoker,
  true,
);
await verifyRealEstateNotifications(db, {
  org,
  other,
  actor,
  viewer,
  external,
  property,
  contract,
  id,
  proposalValues,
  contractValues,
  record,
  values,
  prop,
  otherOwner,
  today,
});
await db.close();
console.log(
  "Visão geral: busca global, percentuais literais, pendências, decisões, atalhos, contagens, paginação e isolamento por empresa/perfil OK.",
);
