import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260914120000_portal_triage_queue.sql",
  "utf8",
);
const pgTap = readFileSync("supabase/tests/database/073_portal_triage_queue.sql", "utf8");
const component = readFileSync(
  "src/components/communication/portal-service-center.tsx",
  "utf8",
);
const hook = readFileSync("src/hooks/use-communication.ts", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/portal-triage-queue.md", "utf8");

test("claim is restricted to shared, active and unassigned portal conversations", () => {
  assert.match(migration, /thread\.assigned_to IS NULL/);
  assert.match(migration, /thread\.archived_at IS NULL/);
  assert.match(migration, /is_org_member\(thread\.organization_id\)/);
  assert.match(migration, /client_portal_communication_shares/);
  assert.match(migration, /share\.is_shared/);
  assert.match(migration, /communication_assert_role\([\s\S]*false/);
  assert.match(pgTap, /an existing assignee is never replaced/);
  assert.match(pgTap, /a private conversation cannot be claimed/);
});

test("claim assigns only to the authenticated staff member and is audited", () => {
  assert.match(migration, /SET assigned_to = auth\.uid\(\)/);
  assert.match(migration, /communication\.assignee\.claimed/);
  assert.match(migration, /source', 'portal_triage/);
  assert.match(pgTap, /operational staff can claim/);
  assert.match(pgTap, /a viewer cannot claim/);
});

test("service center highlights unassigned work and offers one-click claim", () => {
  assert.match(component, /Triagem pendente/);
  assert.match(component, /summary\.unassigned/);
  assert.match(component, /Assumir atendimento/);
  assert.match(component, /claim\.mutateAsync\(item\.item_id\)/);
  assert.match(hook, /claim_portal_communication_thread/);
  assert.match(hook, /queryKey: \["team-members", organizationId\]/);
  assert.match(types, /claim_portal_communication_thread: \{/);
  assert.match(docs, /nunca substitui\s+um responsável existente/);
});
