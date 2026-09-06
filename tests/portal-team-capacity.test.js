import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260913120000_portal_team_capacity.sql",
  "utf8",
);
const pgTap = readFileSync("supabase/tests/database/072_portal_team_capacity.sql", "utf8");
const hook = readFileSync("src/hooks/use-team.ts", "utf8");
const page = readFileSync("src/routes/_authenticated/equipe.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/portal-team-capacity.md", "utf8");

test("team members have explicit portal availability and capacity", () => {
  assert.match(migration, /receives_portal_communications boolean NOT NULL DEFAULT false/);
  assert.match(migration, /portal_communication_capacity integer NOT NULL DEFAULT 20/);
  assert.match(migration, /portal_communication_capacity BETWEEN 1 AND 500/);
  assert.match(types, /receives_portal_communications: boolean/);
  assert.match(types, /portal_communication_capacity: number/);
});

test("selector skips paused or full members and keeps fair tenant-safe balancing", () => {
  assert.match(migration, /member\.organization_id = _organization_id/);
  assert.match(migration, /member\.is_active/);
  assert.match(migration, /member\.receives_portal_communications/);
  assert.match(migration, /workload\.open_threads < member\.portal_communication_capacity/);
  assert.match(migration, /workload\.open_threads::numeric \/ member\.portal_communication_capacity/);
  assert.match(migration, /last_portal_communication_assigned_at NULLS FIRST/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(pgTap, /paused and at-capacity members are skipped/);
});

test("configuration RPC is guarded, validated and audited", () => {
  assert.match(migration, /automation_can_manage\(target_member\.organization_id\)/);
  assert.match(migration, /ROLE_NOT_ELIGIBLE/);
  assert.match(migration, /member\.portal_communication_distribution_updated/);
  assert.match(migration, /TO authenticated/);
  assert.match(pgTap, /a viewer cannot be enabled/);
});

test("team page exposes availability, current load and capacity controls", () => {
  assert.match(hook, /openCommunications/);
  assert.match(hook, /update_member_portal_communication_distribution/);
  assert.match(page, /Atendimentos do portal/);
  assert.match(page, /Configurar atendimento/);
  assert.match(page, /Receber novas conversas do portal automaticamente/);
  assert.match(page, /Carga atual:/);
  assert.match(docs, /triagem manual/);
});
