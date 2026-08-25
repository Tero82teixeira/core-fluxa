import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825040000_stale_lead_notifications.sql",
  "utf8",
);
const settings = readFileSync("src/lib/organization-settings.ts", "utf8");
const settingsPage = readFileSync(
  "src/routes/_authenticated/configuracoes.tsx",
  "utf8",
);
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("stale leads use the approved three- and seven-day stages", () => {
  assert.match(migration, /days_without_contact >= 7 THEN 7/);
  assert.match(migration, /ELSE 3/);
  assert.match(migration, /::date - 3/);
  assert.match(migration, /::time >= time '08:00'/);
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names AS zone/);
  assert.match(migration, /ELSE 'America\/Sao_Paulo'/);
});

test("only non-archived leads in active organizations are scanned", () => {
  assert.match(migration, /organization\.archived_at IS NULL/);
  assert.match(migration, /client\.archived_at IS NULL/);
  assert.match(migration, /client\.status = 'lead'/);
  assert.match(
    migration,
    /coalesce\(client\.last_interaction_at, client\.created_at\)/,
  );
  assert.match(migration, /clients_stale_lead_interaction_idx/);
  assert.doesNotMatch(migration, /client\.status = 'ativo'/);
});

test("owners receive reminders and management receives fallback or escalation", () => {
  assert.match(migration, /member\.user_id = lead\.owner_id/);
  assert.match(migration, /member\.is_active/);
  assert.match(migration, /WHERE lead\.stage = 7/);
  assert.match(
    migration,
    /manager\.role::text IN \([\s\S]*'superadmin', 'proprietario', 'administrador'[\s\S]*\)/,
  );
  assert.match(migration, /owner\.user_id = lead\.owner_id/);
  assert.match(migration, /SELECT \* FROM owner_recipients\s+UNION\s+SELECT \* FROM management_recipients/);
});

test("lead episodes are configurable, idempotent and cost limited", () => {
  assert.match(migration, /notification_preferences->>'stale_leads'/);
  assert.match(migration, /'stale-lead:' \|\| recipient\.client_id::text/);
  assert.match(migration, /recipient\.reference_at AT TIME ZONE 'UTC'/);
  assert.match(migration, /recipient\.stage::text/);
  assert.match(migration, /recipient\.user_id::text AS dedupe_key/);
  assert.match(migration, /existing\.dedupe_key = candidate\.dedupe_key/);
  assert.match(migration, /LIMIT 200/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("the stale-lead scan only creates internal notifications", () => {
  assert.match(migration, /INSERT INTO public\.notifications/);
  assert.match(migration, /'communication'/);
  assert.match(migration, /'cliente'/);
  assert.match(migration, /'\/clientes\/' \|\| candidate\.client_id::text/);
  assert.doesNotMatch(migration, /INSERT INTO public\.tasks/);
  assert.doesNotMatch(migration, /UPDATE public\.clients/);
  assert.doesNotMatch(migration, /net\.http|https?:\/\/|service_role_key|anon_key/i);
});

test("the private helper reuses the single temporal clock", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_stale_lead_notifications\(timestamptz\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_stale_lead_notifications\(timestamptz\)[\s\S]*TO postgres/,
  );
  assert.match(migration, /create_stale_lead_notifications\(\)/);
  assert.match(migration, /STALE_LEAD_SCAN_FAILED/);
  assert.match(migration, /stale_lead_notifications_created/);
  assert.equal(
    migration.match(/scheduled_count := public\.process_due_scheduled_automations\(\);/g)
      ?.length,
    1,
  );
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
});

test("all earlier temporal stages remain present", () => {
  for (const stage of [
    "process_due_scheduled_automations",
    "process_due_financial_recurrences",
    "create_weekly_financial_summary_notifications",
    "create_weekly_data_quality_notifications",
    "create_stale_client_notifications",
    "create_client_birthday_notifications",
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

test("settings, generated types and documentation expose stale leads", () => {
  assert.match(settings, /stale_leads: true/);
  assert.match(settingsPage, /Leads sem acompanhamento/);
  assert.match(types, /create_stale_lead_notifications:/);
  assert.match(docs, /## Leads sem acompanhamento/);
  assert.match(docs, /três dias civis/);
  assert.match(docs, /sete dias/);
  assert.match(docs, /Contato realizado/);
});
