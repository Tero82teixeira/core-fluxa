import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825020000_stale_client_followups.sql",
  "utf8",
);
const mutations = readFileSync("src/hooks/use-mutations.ts", "utf8");
const communicationHook = readFileSync("src/hooks/use-communication.ts", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("only a confirmed communication contact updates the last interaction", () => {
  assert.match(
    migration,
    /AFTER INSERT ON public\.communication_entries[\s\S]*WHEN \(NEW\.contact_made\)/,
  );
  assert.match(migration, /UPDATE public\.clients AS client/);
  assert.match(migration, /client\.last_interaction_at < interaction_at/);
  assert.match(migration, /interaction_at := LEAST\(NEW\.occurred_at, now\(\)\)/);
  assert.doesNotMatch(
    mutations,
    /\.update\(\{ \.\.\.values, updated_by: actor\.userId, last_interaction_at:/,
  );
  assert.match(communicationHook, /queryKey: \["clients"\]/);
  assert.match(communicationHook, /queryKey: \["clients-page"\]/);
  assert.match(communicationHook, /queryKey: \["client"\]/);
});

test("the scan uses 30 civil days in the active organization timezone", () => {
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names AS zone/);
  assert.match(migration, /ELSE 'America\/Sao_Paulo'/);
  assert.match(migration, /client\.status::text = 'ativo'/);
  assert.match(migration, /client\.archived_at IS NULL/);
  assert.match(migration, /organization\.archived_at IS NULL/);
  assert.match(migration, /::time >= time '08:00'/);
  assert.match(migration, /::date - 30/);
});

test("the active owner receives the alert and management is the fallback", () => {
  assert.match(migration, /member\.user_id = client\.owner_id/);
  assert.match(migration, /member\.is_active/);
  assert.match(
    migration,
    /manager\.role::text IN \([\s\S]*'superadmin', 'proprietario', 'administrador'[\s\S]*\)/,
  );
  assert.match(migration, /WHERE NOT EXISTS \([\s\S]*owner\.user_id = client\.owner_id/);
});

test("each inactivity episode is idempotent and cost limited", () => {
  assert.match(migration, /'stale-client:' \|\| recipient\.client_id::text/);
  assert.match(migration, /recipient\.reference_at AT TIME ZONE 'UTC'/);
  assert.match(migration, /':30:' \|\| recipient\.user_id::text/);
  assert.match(migration, /existing\.dedupe_key = candidate\.dedupe_key/);
  assert.match(migration, /LIMIT 200/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("the helper is private and reuses the single temporal clock", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_stale_client_notifications\(timestamptz\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_stale_client_notifications\(timestamptz\)[\s\S]*TO postgres/,
  );
  assert.match(migration, /create_stale_client_notifications\(\)/);
  assert.match(migration, /STALE_CLIENT_SCAN_FAILED/);
  assert.match(migration, /stale_client_notifications_created/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
});

test("the scan only creates internal notifications", () => {
  assert.match(migration, /INSERT INTO public\.notifications/);
  assert.match(migration, /'\/clientes\/' \|\| candidate\.client_id::text/);
  assert.doesNotMatch(migration, /INSERT INTO public\.tasks/);
  assert.doesNotMatch(migration, /UPDATE public\.communication_threads/);
});

test("all earlier temporal stages remain present", () => {
  for (const stage of [
    "process_due_scheduled_automations",
    "process_due_financial_recurrences",
    "create_weekly_financial_summary_notifications",
    "create_weekly_data_quality_notifications",
    "create_critical_monitoring_notifications",
    "create_unassigned_monitoring_notifications",
    "create_deadline_reminder_notifications",
    "create_overdue_task_escalation_notifications",
    "create_stale_process_notifications",
    "create_overdue_communication_notifications",
    "create_expired_document_notifications",
    "create_overdue_financial_notifications",
  ]) {
    assert.match(migration, new RegExp(`${stage}\\(\\)`));
  }
});

test("generated types and documentation expose the behavior", () => {
  assert.match(types, /create_stale_client_notifications:/);
  assert.match(docs, /Clientes sem contato recente/);
  assert.match(docs, /Contato realizado/);
  assert.match(docs, /30 dias civis/);
});
