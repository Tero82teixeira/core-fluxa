import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825050000_stale_task_notifications.sql",
  "utf8",
);
const settings = readFileSync("src/lib/organization-settings.ts", "utf8");
const settingsPage = readFileSync(
  "src/routes/_authenticated/configuracoes.tsx",
  "utf8",
);
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("stale tasks use a configurable first stage and doubled escalation", () => {
  assert.match(migration, /settings\.stale_task_days, 5/);
  assert.match(migration, /stale_task_days BETWEEN 1 AND 90/);
  assert.match(migration, /inactive_days >= task\.stale_task_days \* 2 THEN 2/);
  assert.match(migration, /inactive_days >= task\.stale_task_days/);
  assert.match(migration, /local_time >= time '08:00'/);
});

test("task activity includes edits, history and active comments", () => {
  assert.match(migration, /greatest\([\s\S]*task\.updated_at/);
  assert.match(migration, /FROM public\.task_history AS entry/);
  assert.match(migration, /max\(entry\.created_at\) AS last_history_at/);
  assert.match(migration, /FROM public\.task_comments AS entry/);
  assert.match(migration, /max\(greatest\(entry\.created_at, entry\.updated_at\)\)/);
  assert.match(migration, /entry\.archived_at IS NULL/);
});

test("closed, unassigned and overdue tasks do not overlap", () => {
  assert.match(migration, /task\.assignee_id IS NOT NULL/);
  assert.match(migration, /task\.archived_at IS NULL/);
  assert.match(migration, /task\.deleted_at IS NULL/);
  assert.match(migration, /task\.completed_at IS NULL/);
  assert.match(
    migration,
    /task\.status::text NOT IN \('concluida', 'cancelada', 'arquivada'\)/,
  );
  assert.match(
    migration,
    /task\.due_at IS NULL[\s\S]*task\.due_at AT TIME ZONE 'UTC'[\s\S]*>= config\.local_today/,
  );
});

test("active assignees receive the first stage and management receives escalation", () => {
  assert.match(migration, /member\.user_id = task\.assignee_id/);
  assert.match(migration, /member\.is_active/);
  assert.match(migration, /WHERE task\.stage = 2/);
  assert.match(
    migration,
    /manager\.role::text IN \([\s\S]*'superadmin', 'proprietario', 'administrador'[\s\S]*\)/,
  );
  assert.match(migration, /SELECT \* FROM owner_recipients\s+UNION\s+SELECT \* FROM management_recipients/);
});

test("episodes are configurable, idempotent and cost limited", () => {
  assert.match(migration, /notification_preferences->>'stale_tasks'/);
  assert.match(migration, /'stale-task:' \|\| recipient\.task_id::text/);
  assert.match(migration, /recipient\.last_activity_at AT TIME ZONE 'UTC'/);
  assert.match(migration, /recipient\.stale_task_days::text/);
  assert.match(migration, /recipient\.stage::text/);
  assert.match(migration, /recipient\.user_id::text/);
  assert.match(migration, /LIMIT 200/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("scan only creates internal notifications", () => {
  assert.match(migration, /INSERT INTO public\.notifications/);
  assert.match(migration, /'task'/);
  assert.match(migration, /'tarefa'/);
  assert.match(migration, /'\/tarefas'/);
  assert.doesNotMatch(migration, /INSERT INTO public\.tasks/);
  assert.doesNotMatch(migration, /UPDATE public\.tasks/);
  assert.doesNotMatch(migration, /net\.http|https?:\/\/|service_role_key|anon_key/i);
});

test("private helper reuses the complete temporal cycle", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_stale_task_notifications\(timestamptz\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_stale_task_notifications\(timestamptz\)[\s\S]*TO postgres/,
  );
  assert.match(migration, /stale_task_count := public\.create_stale_task_notifications\(\)/);
  assert.match(migration, /STALE_TASK_SCAN_FAILED/);
  assert.match(migration, /stale_task_notifications_created/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
  for (const stage of [
    "process_due_scheduled_automations",
    "process_due_financial_recurrences",
    "create_weekly_financial_summary_notifications",
    "create_weekly_data_quality_notifications",
    "create_stale_client_notifications",
    "create_client_birthday_notifications",
    "create_stale_lead_notifications",
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

test("settings, generated types and documentation expose stale tasks", () => {
  assert.match(settings, /stale_task_days: 5/);
  assert.match(settings, /stale_tasks: true/);
  assert.match(settings, /"stale_task_days"/);
  assert.match(settingsPage, /Tarefa sem movimentação \(dias\)/);
  assert.match(settingsPage, /"stale_tasks", "Tarefas sem movimentação"/);
  assert.match(types, /stale_task_days: number \| null/);
  assert.match(types, /create_stale_task_notifications:/);
  assert.match(docs, /## Tarefas sem movimentação/);
  assert.match(docs, /escalonamento de atrasos de 1, 3 e 7 dias/);
});

test("settings RPC reads, validates and persists the configured period", () => {
  assert.match(migration, /'stale_task_days',COALESCE\(s\.stale_task_days,5\)/);
  assert.match(migration, /SETTINGS_STALE_TASK_DAYS_INVALID/);
  assert.match(
    migration,
    /stale_task_days=COALESCE\(\(_changes->>'stale_task_days'\)::int,s\.stale_task_days\)/,
  );
});
