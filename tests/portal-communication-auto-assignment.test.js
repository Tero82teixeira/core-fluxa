import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260912120000_portal_communication_auto_assignment.sql",
  "utf8",
);
const pgTap = readFileSync(
  "supabase/tests/database/071_portal_communication_auto_assignment.sql",
  "utf8",
);
const settings = readFileSync("src/lib/organization-settings.ts", "utf8");
const settingsPage = readFileSync("src/routes/_authenticated/configuracoes.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/portal-communication-auto-assignment.md", "utf8");

test("automatic portal assignment is opt-in and configurable", () => {
  assert.match(migration, /auto_assign_portal_communications boolean[\s\S]*DEFAULT false/);
  assert.match(settings, /auto_assign_portal_communications: false/);
  assert.match(settingsPage, /Distribuir automaticamente atendimentos do portal/);
  assert.match(settingsPage, /set\("auto_assign_portal_communications", v\)/);
  assert.match(types, /auto_assign_portal_communications: boolean/);
  assert.match(docs, /desativado por padrão/);
});

test("selector is tenant-safe and balances eligible active staff", () => {
  assert.match(migration, /member\.organization_id = _organization_id/);
  assert.match(migration, /thread\.organization_id = member\.organization_id/);
  assert.match(migration, /member\.is_active/);
  assert.match(migration, /'gestor', 'operacional'/);
  assert.match(migration, /workload\.open_threads/);
  assert.match(migration, /workload\.last_assigned_at NULLS FIRST/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(pgTap, /lower open workload receives the new portal conversation/);
});

test("only unassigned public client portal messages trigger distribution", () => {
  assert.match(migration, /NEW\.entry_type::text <> 'mensagem'/);
  assert.match(migration, /NEW\.is_internal/);
  assert.match(migration, /NEW\.metadata->>'source' <> 'client_portal'/);
  assert.match(migration, /thread_row\.assigned_to IS NOT NULL/);
  assert.match(migration, /thread\.archived_at IS NULL/);
  assert.match(pgTap, /an existing assignee is never replaced/);
  assert.match(pgTap, /disabled setting leaves the conversation unassigned/);
});

test("assignment is observable without exposing a public helper", () => {
  assert.match(migration, /communication\.assignee\.auto_assigned/);
  assert.match(migration, /Novo atendimento atribuído/);
  assert.match(migration, /portal-auto-assignment:/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /TO postgres/);
  assert.doesNotMatch(migration, /cron\.schedule|net\.http|https?:\/\/|service_role_key|anon_key/i);
});
