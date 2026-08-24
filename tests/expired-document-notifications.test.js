import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260824190000_expired_document_notifications.sql",
  "utf8",
);
const pgTap = readFileSync(
  "supabase/tests/database/028_expired_document_notifications.sql",
  "utf8",
);
const settings = readFileSync("src/lib/organization-settings.ts", "utf8");
const settingsPage = readFileSync(
  "src/routes/_authenticated/configuracoes.tsx",
  "utf8",
);
const databaseTypes = readFileSync(
  "src/integrations/supabase/types.ts",
  "utf8",
);
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("expired documents complement the existing advance reminders", () => {
  assert.match(migration, /FROM public\.documents AS document/);
  assert.match(migration, /document\.overdue_days >= 30 THEN 3/);
  assert.match(migration, /document\.overdue_days >= 7 THEN 2/);
  assert.match(migration, /document\.overdue_days >= 1/);
  assert.match(migration, /document\.expiration_date IS NOT NULL/);
  assert.match(migration, /document\.archived_at IS NULL/);
  assert.match(migration, /document\.status::text <> 'arquivado'/);
  assert.match(docs, /30, 15, 7 e 1/);
});

test("expiration age uses the organization civil date", () => {
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names AS zone/);
  assert.match(migration, /ELSE 'America\/Sao_Paulo'/);
  assert.match(migration, /now\(\) AT TIME ZONE config\.timezone_name/);
  assert.match(migration, /- document\.expiration_date/);
  assert.match(pgTap, /SET LOCAL TIME ZONE 'America\/Sao_Paulo'/);
});

test("recipients use monitoring assignment and management escalation", () => {
  assert.match(migration, /member\.user_id = monitoring_state\.assigned_to/);
  assert.match(migration, /document\.responsible_id IS NOT NULL/);
  assert.match(migration, /document\.responsible_id IS NULL/);
  assert.match(migration, /document\.notice_stage >= 2/);
  assert.match(migration, /manager\.organization_id = document\.organization_id/);
  assert.match(
    migration,
    /manager\.role::text IN \('superadmin', 'proprietario', 'administrador'\)/,
  );
  assert.match(migration, /\n    UNION\n/);
  assert.doesNotMatch(migration, /\n    UNION ALL\n/);
});

test("resolved, hidden, disabled and critical flows do not overlap", () => {
  assert.match(migration, /notification_preferences->>'expiring_documents'/);
  assert.match(migration, /monitoring_show_documents/);
  assert.match(migration, /NOT IN \('resolvido', 'ignorado'\)/);
  assert.match(migration, /FROM public\.operational_monitoring_alerts AS alert/);
  assert.match(migration, /alert\.source_type = 'documento'/);
  assert.match(migration, /alert\.source_id = document\.document_id/);
  assert.match(migration, /alert\.priority_override, alert\.suggested_priority/);
  assert.match(migration, /preferences->>'critical_monitoring'/);
});

test("each expiration, stage and recipient is idempotent", () => {
  assert.match(migration, /'expired-document:' \|\| document\.document_id::text/);
  assert.match(migration, /document\.expiration_date::text/);
  assert.match(migration, /document\.notice_stage::text/);
  assert.match(migration, /document\.user_id::text/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("the scan only notifies and preserves the single private clock", () => {
  for (const existingStage of [
    "process_due_scheduled_automations",
    "create_critical_monitoring_notifications",
    "create_unassigned_monitoring_notifications",
    "create_deadline_reminder_notifications",
    "create_overdue_task_escalation_notifications",
    "create_stale_process_notifications",
    "create_overdue_communication_notifications",
  ]) {
    assert.match(migration, new RegExp(`${existingStage}\\(\\)`));
  }
  assert.match(
    migration,
    /expired_document_count :=\s+public\.create_expired_document_notifications\(\)/,
  );
  assert.match(migration, /EXPIRED_DOCUMENT_SCAN_FAILED/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.tasks|UPDATE public\.documents/i);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_expired_document_notifications\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_expired_document_notifications\(\)[\s\S]*TO postgres/,
  );
});

test("existing settings, types and documentation expose the feature", () => {
  assert.match(settings, /expiring_documents: true/);
  assert.match(settingsPage, /"expiring_documents", "Documentos vencendo"/);
  assert.match(databaseTypes, /create_expired_document_notifications:/);
  assert.match(docs, /Avisos de documentos vencidos/);
});
