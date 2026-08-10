import { execFileSync } from "node:child_process";

const databaseUrl =
  process.env.SUPABASE_LOCAL_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const expectedTables = [
  "organizations",
  "profiles",
  "organization_members",
  "clients",
  "processes",
  "tasks",
  "automation_rules",
  "financial_transactions",
  "communication_threads",
  "monitoring_states",
];
const expectedFunctions = [
  "is_org_member",
  "has_org_role",
  "create_invitation",
  "create_automation_rule",
  "automation_conditions_match",
  "process_automation_event",
  "create_communication_thread",
  "update_organization_settings",
];

function query(sql) {
  return execFileSync(
    "psql",
    [databaseUrl, "-XAt", "--set", "ON_ERROR_STOP=1", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
}

function assertPresent(kind, expected, actual) {
  const missing = expected.filter((name) => !actual.includes(name));
  if (missing.length) {
    throw new Error(`Schema parity failed: missing ${kind}: ${missing.join(", ")}`);
  }
}

const tables = query(
  "select tablename from pg_catalog.pg_tables where schemaname = 'public' order by 1",
);
const functions = query(
  "select distinct proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1",
);
const tablesWithoutRls = query(
  "select relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1",
);

assertPresent("tables", expectedTables, tables);
assertPresent("functions", expectedFunctions, functions);
if (tablesWithoutRls.length) {
  throw new Error(
    `Schema parity failed: public tables without RLS: ${tablesWithoutRls.join(", ")}`,
  );
}

console.log(
  `Schema parity OK (${tables.length} public tables, ${functions.length} public functions, RLS enabled on every table).`,
);
