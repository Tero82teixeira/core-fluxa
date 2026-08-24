import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260824130000_overdue_task_escalations.sql",
  "utf8",
);
const pgTap = readFileSync(
  "supabase/tests/database/025_overdue_task_escalations.sql",
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

test("overdue escalation uses only the approved 1, 3 and 7 day ladder", () => {
  assert.match(migration, /FROM public\.tasks AS task/);
  assert.match(migration, /ARRAY\[1, 3, 7\]/);
  assert.match(migration, /task\.status::text NOT IN \('concluida', 'cancelada', 'arquivada'\)/);
  assert.match(migration, /task\.archived_at IS NULL/);
  assert.match(migration, /task\.deleted_at IS NULL/);
  assert.match(migration, /task\.completed_at IS NULL/);
  assert.match(migration, /config\.local_today - 7/);
  assert.match(migration, /task\.due_at </);
});

test("task dates stay civil while today follows the organization timezone", () => {
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names AS zone/);
  assert.match(migration, /ELSE 'America\/Sao_Paulo'/);
  assert.match(migration, /now\(\) AT TIME ZONE config\.timezone_name/);
  assert.match(migration, /task\.due_at AT TIME ZONE 'UTC'/);
  assert.match(pgTap, /SET LOCAL TIME ZONE 'America\/Sao_Paulo'/);
});

test("recipients follow the responsible then management escalation", () => {
  assert.match(migration, /task\.overdue_days IN \(1, 3\)/);
  assert.match(migration, /task\.overdue_days IN \(3, 7\)/);
  assert.match(migration, /\n    UNION\n/);
  assert.doesNotMatch(migration, /\n    UNION ALL\n/);
  assert.match(migration, /assignee\.organization_id = task\.organization_id/);
  assert.match(migration, /assignee\.user_id = task\.assignee_id/);
  assert.match(migration, /assignee\.is_active/);
  assert.match(migration, /manager\.organization_id = task\.organization_id/);
  assert.match(migration, /manager\.role::text IN \('superadmin', 'proprietario', 'administrador'\)/);
});

test("each recipient, deadline and escalation stage is idempotent", () => {
  assert.match(migration, /'overdue-task-escalation:' \|\| task\.task_id::text/);
  assert.match(migration, /task\.due_on::text/);
  assert.match(migration, /task\.overdue_days::text/);
  assert.match(migration, /task\.user_id::text/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("the private scan is isolated and reuses the existing clock", () => {
  for (const existingStage of [
    "process_due_scheduled_automations",
    "create_critical_monitoring_notifications",
    "create_unassigned_monitoring_notifications",
    "create_deadline_reminder_notifications",
  ]) {
    assert.match(migration, new RegExp(`${existingStage}\\(\\)`));
  }
  assert.match(
    migration,
    /overdue_escalation_count :=[\s\S]*create_overdue_task_escalation_notifications\(\)/,
  );
  assert.match(migration, /OVERDUE_TASK_ESCALATION_SCAN_FAILED/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_overdue_task_escalation_notifications\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_overdue_task_escalation_notifications\(\)[\s\S]*TO postgres/,
  );
});

test("existing overdue-task preference, types and documentation cover the feature", () => {
  assert.match(settings, /overdue_tasks: true/);
  assert.match(settingsPage, /"overdue_tasks", "Tarefas atrasadas"/);
  assert.match(databaseTypes, /create_overdue_task_escalation_notifications:/);
  assert.match(docs, /Escalonamento de tarefas atrasadas/);
});
