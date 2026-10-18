import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(resolve(process.env.FLUXA_PGLITE_ROOT || ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const org = id(1),
  other = id(2),
  actor = id(10),
  viewer = id(11),
  external = id(12),
  inactive = id(13),
  client = id(20),
  foreignClient = id(21),
  caseId = id(5060);
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TYPE app_role AS ENUM ('superadmin','proprietario','administrador','gestor','operacional','atendimento','financeiro','visualizador','cliente_externo');
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE organization_settings(organization_id uuid PRIMARY KEY,business_segment text,enabled_modules jsonb);
CREATE TABLE organization_members(organization_id uuid,user_id uuid,role app_role,is_active boolean);
CREATE TABLE clients(id uuid PRIMARY KEY,organization_id uuid,name text,archived_at timestamptz);
CREATE TABLE processes(id uuid PRIMARY KEY,organization_id uuid,client_id uuid,code text,title text,stage text,owner_name text,due_date date,archived_at timestamptz);
CREATE TABLE tasks(id uuid PRIMARY KEY,organization_id uuid,client_id uuid,process_id uuid,title text,assignee_name text,status text,due_at timestamptz,deleted_at timestamptz);
CREATE TABLE audit_logs(organization_id uuid,actor_id uuid,action text,entity text,entity_id uuid,metadata jsonb);
CREATE FUNCTION has_org_role(org uuid,roles app_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=org AND user_id=auth.uid() AND is_active AND role=ANY(roles)); $$;
INSERT INTO organizations VALUES('${org}'),('${other}');
INSERT INTO organization_settings VALUES('${org}','legal','["legal_workspace"]'),('${other}','legal','["legal_workspace"]');
INSERT INTO organization_members VALUES('${org}','${actor}','proprietario',true),('${org}','${viewer}','visualizador',true),('${org}','${external}','cliente_externo',true),('${org}','${inactive}','gestor',false);
INSERT INTO clients VALUES('${client}','${org}','Cliente jurídico',null),('${foreignClient}','${other}','Outra empresa',null);
INSERT INTO processes SELECT ('00000000-0000-0000-0000-'||lpad((n+1000)::text,12,'0'))::uuid,'${org}','${client}','PROC-'||n,'Processo antigo','em_andamento','Equipe','2030-01-01',null FROM generate_series(1,505) n;
INSERT INTO processes VALUES('${caseId}','${org}','${client}','PROC-506','Processo principal','exigencia',null,'2026-10-20',null),('${id(5061)}','${org}','${client}','FECHADO','Fechado','finalizado',null,'2026-10-17',null),('${id(5062)}','${other}','${foreignClient}','OUTRO','Outro','em_andamento',null,'2026-10-17',null),('${id(5063)}','${org}','${client}','ARQUIVADO','Arquivado','em_andamento',null,'2026-10-17',now());
INSERT INTO tasks SELECT ('00000000-0000-0000-0000-'||lpad((n+10000)::text,12,'0'))::uuid,'${org}',null,null,'Tarefa '||n,'Equipe','pendente','2026-11-01 12:00Z',null FROM generate_series(1,505) n;
INSERT INTO tasks VALUES('${id(11000)}','${org}',null,'${caseId}','Retorno',null,'pendente','2026-10-19 02:59Z',null),('${id(11001)}','${org}',null,null,'Concluída',null,'concluida','2026-10-18 12:00Z',null),('${id(11002)}','${other}',null,null,'Outra empresa',null,'pendente','2026-10-18 12:00Z',null),('${id(11003)}','${org}',null,null,'Excluída',null,'pendente','2026-10-18 12:00Z',now()),('${id(11004)}','${org}',null,null,'Limite exclusivo',null,'pendente','2026-10-19 03:00Z',null);
SET test.actor='${actor}';
`);
for (const file of [
  "20261020120000_legal_case_profiles.sql",
  "20261022120000_legal_deadlines.sql",
  "20261023120100_legal_workspace_reliability.sql",
])
  await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
assert.equal(
  readFileSync("docs/operations/legal-workspace-reliability.sql", "utf8"),
  readFileSync("supabase/migrations/20261023120100_legal_workspace_reliability.sql", "utf8"),
);
await db.exec(`INSERT INTO legal_case_profiles(organization_id,process_id,confidential,next_hearing_at,created_by,updated_by) VALUES('${org}','${caseId}',true,'2026-10-18 03:00Z','${actor}','${actor}');
INSERT INTO legal_deadlines(organization_id,process_id,title,due_date,status,created_by,updated_by) VALUES
('${org}','${caseId}','Vencido','2026-10-17','aberto','${actor}','${actor}'),
('${org}','${caseId}','Hoje','2026-10-18','aberto','${actor}','${actor}'),
('${org}','${caseId}','Sete dias','2026-10-25','aberto','${actor}','${actor}'),
('${org}','${caseId}','Futuro','2026-10-26','aberto','${actor}','${actor}'),
('${org}','${caseId}','Já concluído','2026-10-18','concluido','${actor}','${actor}'),
('${org}','${caseId}','Cancelado','2026-10-18','cancelado','${actor}','${actor}'),
('${org}','${id(5061)}','Processo fechado','2026-10-18','aberto','${actor}','${actor}'),
('${other}','${id(5062)}','Outra organização','2026-10-18','aberto','${actor}','${actor}');
SET ROLE authenticated;`);
const call = async (action, values = { date: "2026-10-18" }, organization = org) =>
  (
    await db.query("SELECT read_legal_workspace($1,$2,$3) AS result", [
      organization,
      action,
      JSON.stringify(values),
    ])
  ).rows[0].result;
let dash = await call("dashboard");
assert.deepEqual(dash.counts, {
  active: 506,
  overdue: 1,
  today: 1,
  nextSeven: 2,
  requirement: 1,
  withoutOwner: 1,
});
assert.equal(dash.urgentTotal, 4);
assert.equal(dash.urgentProcesses.length, 4);
assert.equal(dash.urgentProcesses.filter((x) => x.source === "individual").length, 3);
assert.equal(dash.taskTotal, 2);
assert.equal(
  dash.stageCounts.reduce((sum, x) => sum + x.count, 0),
  506,
);
const range = {
  date: "2026-10-18",
  endDate: "2026-10-19",
  from: "2026-10-18T03:00:00Z",
  to: "2026-10-19T03:00:00Z",
};
let day = await call("agenda", range);
assert.deepEqual(day.counts, { hearing: 1, deadline: 1, task: 1 });
assert.equal(day.total, 3);
assert(day.items.every((x) => x.confidential));
assert.equal(day.items.find((x) => x.kind === "deadline").civil_date, "2026-10-18");
const november = {
  date: "2026-11-01",
  endDate: "2026-11-02",
  from: "2026-11-01T03:00:00Z",
  to: "2026-11-02T03:00:00Z",
};
const seen = new Set();
for (let page = 1; page <= 26; page++) {
  const data = await call("agenda", { ...november, page });
  assert.equal(data.total, 505);
  assert.equal(data.counts.task, 505);
  assert.equal(data.items.length, page === 26 ? 5 : 20);
  for (const x of data.items) {
    assert(!seen.has(x.id));
    seen.add(x.id);
  }
}
assert.equal(seen.size, 505);
// Gravações reais existentes devem refletir nas próximas leituras.
await db.query("SELECT upsert_legal_case_profile($1,$2,_next_hearing_at:=$3)", [
  org,
  caseId,
  "2026-10-19T03:00:00Z",
]);
assert.equal((await call("agenda", range)).counts.hearing, 0);
const deadline = (
  await db.query("SELECT list_legal_deadlines($1,$2) AS data", [org, caseId])
).rows[0].data.find((x) => x.title === "Hoje");
await db.query("SELECT save_legal_deadline($1,$2,$3,$4,$5,$6)", [
  org,
  caseId,
  deadline.title,
  deadline.due_date,
  "concluido",
  deadline.id,
]);
assert.equal((await call("dashboard")).counts.today, 0);
assert.equal((await call("agenda", range)).counts.deadline, 0);
for (const values of [
  {},
  { date: "infinity" },
  { ...range, page: 0 },
  { ...range, page: 1000001 },
  { ...range, to: "infinity" },
  { ...range, endDate: "2026-10-26" },
  { ...range, from: "2026-10-17T03:00Z" },
])
  await assert.rejects(() => call("agenda", values));
await assert.rejects(() => call("invalid"));
await assert.rejects(() => call("dashboard", null));
await assert.rejects(() => call("dashboard", undefined, other), /ACCESS_DENIED/);
for (const user of [external, inactive, ""]) {
  await db.exec(`SET test.actor='${user}'`);
  await assert.rejects(() => call("dashboard"), /ACCESS_DENIED/);
}
await db.exec(`SET test.actor='${viewer}'`);
assert.equal((await call("dashboard")).counts.active, 506);
await db.exec(
  `RESET ROLE; UPDATE organization_settings SET enabled_modules='[]' WHERE organization_id='${org}'; SET ROLE authenticated;`,
);
await assert.rejects(() => call("dashboard"), /ACCESS_DENIED/);
await db.exec("SET ROLE anon");
await assert.rejects(() => call("dashboard"), /permission denied/);
await db.exec("RESET ROLE");
const flags = (
  await db.query(
    "SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE proname='read_legal_workspace'",
  )
).rows[0];
assert.equal(flags.prosecdef, true);
assert.equal(flags.provolatile, "s");
assert(flags.proconfig.includes("search_path=public, pg_temp"));
console.log(
  "Legal workspace: complete totals, individual deadlines, >500 events, pagination, mutations, boundaries and access rules passed.",
);
const { verifyLegalSearch } = await import("./legal-search.database.mjs");
await verifyLegalSearch({ db,org,other,actor,viewer,external,inactive,client,caseId,id });
await db.close();
