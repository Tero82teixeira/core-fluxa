import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260824150000_stale_process_notifications.sql",
  "utf8",
);
const pgTap = readFileSync(
  "supabase/tests/database/026_stale_process_notifications.sql",
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

test("stale-process stages use the configurable threshold and seven-day escalation", () => {
  assert.match(migration, /FROM public\.processes AS process/);
  assert.match(migration, /coalesce\(settings\.stale_process_days, 14\)/);
  assert.match(migration, /process\.stale_process_days \+ 7/);
  assert.match(migration, /process\.inactive_days >= process\.stale_process_days/);
  assert.match(
    migration,
    /process\.stage::text NOT IN \('finalizado', 'arquivado', 'cancelado'\)/,
  );
  assert.match(migration, /process\.archived_at IS NULL/);
});

test("inactivity uses civil dates in the organization timezone", () => {
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names AS zone/);
  assert.match(migration, /ELSE 'America\/Sao_Paulo'/);
  assert.match(migration, /now\(\) AT TIME ZONE config\.timezone_name/);
  assert.match(migration, /last_movement_at, process\.updated_at, process\.created_at/);
  assert.match(pgTap, /SET LOCAL TIME ZONE 'America\/Sao_Paulo'/);
});

test("recipients prefer monitoring assignment and escalate without duplicates", () => {
  assert.match(migration, /member\.user_id = stale_state\.assigned_to/);
  assert.match(migration, /member\.user_id = process\.owner_id/);
  assert.match(migration, /process\.responsible_id IS NOT NULL/);
  assert.match(migration, /WHERE process\.notice_stage = 2/);
  assert.match(migration, /manager\.organization_id = process\.organization_id/);
  assert.match(
    migration,
    /manager\.role::text IN \('superadmin', 'proprietario', 'administrador'\)/,
  );
  assert.match(migration, /\n    UNION\n/);
  assert.doesNotMatch(migration, /\n    UNION ALL\n/);
});

test("resolved, disabled and already-critical flows do not overlap", () => {
  assert.match(migration, /notification_preferences->>'stale_processes'/);
  assert.match(migration, /NOT IN \('resolvido', 'ignorado'\)/);
  assert.match(migration, /FROM public\.operational_monitoring_alerts AS alert/);
  assert.match(migration, /alert\.source_type = 'processo'/);
  assert.match(migration, /alert\.source_id = process\.process_id/);
  assert.match(migration, /alert\.priority_override, alert\.suggested_priority/);
  assert.match(migration, /preferences->>'critical_monitoring'/);
});

test("each movement episode, stage and recipient is idempotent", () => {
  assert.match(migration, /'stale-process:' \|\| process\.process_id::text/);
  assert.match(migration, /last_activity_at AT TIME ZONE 'UTC'/);
  assert.match(migration, /process\.stale_process_days::text/);
  assert.match(migration, /process\.notice_stage::text/);
  assert.match(migration, /process\.user_id::text/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("the scan only notifies and reuses the existing private clock", () => {
  for (const existingStage of [
    "process_due_scheduled_automations",
    "create_critical_monitoring_notifications",
    "create_unassigned_monitoring_notifications",
    "create_deadline_reminder_notifications",
    "create_overdue_task_escalation_notifications",
  ]) {
    assert.match(migration, new RegExp(`${existingStage}\\(\\)`));
  }
  assert.match(
    migration,
    /stale_process_count := public\.create_stale_process_notifications\(\)/,
  );
  assert.match(migration, /STALE_PROCESS_SCAN_FAILED/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.tasks|UPDATE public\.processes/i);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_stale_process_notifications\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_stale_process_notifications\(\)[\s\S]*TO postgres/,
  );
});

test("existing settings, types and documentation expose the feature", () => {
  assert.match(settings, /stale_process_days: 14/);
  assert.match(settings, /stale_processes: true/);
  assert.match(settingsPage, /"stale_processes", "Processos sem movimentação"/);
  assert.match(databaseTypes, /create_stale_process_notifications:/);
  assert.match(docs, /Avisos de processos sem movimentação/);
});
