import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260824170000_overdue_communication_followups.sql",
  "utf8",
);
const pgTap = readFileSync(
  "supabase/tests/database/027_overdue_communication_followups.sql",
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

test("overdue communication uses the approved first and third day stages", () => {
  assert.match(migration, /FROM public\.communication_threads AS thread/);
  assert.match(migration, /thread\.overdue_days >= 3 THEN 2 ELSE 1/);
  assert.match(migration, /thread\.overdue_days >= 1/);
  assert.match(
    migration,
    /thread\.status::text NOT IN \('resolvida', 'arquivada'\)/,
  );
  assert.match(migration, /thread\.archived_at IS NULL/);
  assert.match(migration, /thread\.follow_up_at IS NOT NULL/);
});

test("follow-up dates use civil days in the organization timezone", () => {
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names AS zone/);
  assert.match(migration, /ELSE 'America\/Sao_Paulo'/);
  assert.match(migration, /now\(\) AT TIME ZONE config\.timezone_name/);
  assert.match(
    migration,
    /thread\.follow_up_at AT TIME ZONE config\.timezone_name/,
  );
  assert.match(pgTap, /SET LOCAL TIME ZONE 'America\/Sao_Paulo'/);
});

test("recipients prefer monitoring assignment and escalate without duplicates", () => {
  assert.match(migration, /member\.user_id = monitoring_state\.assigned_to/);
  assert.match(migration, /member\.user_id = thread\.assigned_to/);
  assert.match(migration, /thread\.responsible_id IS NOT NULL/);
  assert.match(migration, /WHERE thread\.notice_stage = 2/);
  assert.match(migration, /manager\.organization_id = thread\.organization_id/);
  assert.match(
    migration,
    /manager\.role::text IN \('superadmin', 'proprietario', 'administrador'\)/,
  );
  assert.match(migration, /\n    UNION\n/);
  assert.doesNotMatch(migration, /\n    UNION ALL\n/);
});

test("preferences, hidden communication and critical alerts avoid overlap", () => {
  assert.match(migration, /notification_preferences->>'overdue_communications'/);
  assert.match(migration, /settings\.monitoring_show_communication, true/);
  assert.match(migration, /NOT IN \('resolvido', 'ignorado'\)/);
  assert.match(migration, /FROM public\.operational_monitoring_alerts AS alert/);
  assert.match(migration, /alert\.source_type = 'comunicacao'/);
  assert.match(migration, /alert\.source_id = thread\.thread_id/);
  assert.match(migration, /alert\.priority_override, alert\.suggested_priority/);
  assert.match(migration, /preferences->>'critical_monitoring'/);
});

test("each follow-up date, stage and recipient is idempotent", () => {
  assert.match(
    migration,
    /'overdue-communication:' \|\| thread\.thread_id::text/,
  );
  assert.match(migration, /thread\.follow_up_at AT TIME ZONE 'UTC'/);
  assert.match(migration, /thread\.notice_stage::text/);
  assert.match(migration, /thread\.user_id::text/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("the scan only notifies and reuses the existing private clock", () => {
  for (const existingStage of [
    "process_due_scheduled_automations",
    "create_critical_monitoring_notifications",
    "create_unassigned_monitoring_notifications",
    "create_deadline_reminder_notifications",
    "create_overdue_task_escalation_notifications",
    "create_stale_process_notifications",
  ]) {
    assert.match(migration, new RegExp(`${existingStage}\\(\\)`));
  }
  assert.match(
    migration,
    /overdue_communication_count :=[\s\S]*create_overdue_communication_notifications\(\)/,
  );
  assert.match(migration, /OVERDUE_COMMUNICATION_SCAN_FAILED/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
  assert.doesNotMatch(
    migration,
    /INSERT INTO public\.tasks|UPDATE public\.communication_threads/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_overdue_communication_notifications\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_overdue_communication_notifications\(\)[\s\S]*TO postgres/,
  );
});

test("existing settings, types and documentation expose the feature", () => {
  assert.match(settings, /overdue_communications: true/);
  assert.match(settingsPage, /"overdue_communications", "Retornos vencidos"/);
  assert.match(databaseTypes, /create_overdue_communication_notifications:/);
  assert.match(docs, /Escalonamento de retornos de comunicação/);
});
