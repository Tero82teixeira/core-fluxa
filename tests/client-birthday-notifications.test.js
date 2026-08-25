import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825030000_client_birthday_notifications.sql",
  "utf8",
);
const settings = readFileSync("src/lib/organization-settings.ts", "utf8");
const settingsPage = readFileSync(
  "src/routes/_authenticated/configuracoes.tsx",
  "utf8",
);
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("birthday reminders run seven days before and on the civil birthday", () => {
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names AS zone/);
  assert.match(migration, /ELSE 'America\/Sao_Paulo'/);
  assert.match(migration, /::time >= time '08:00'/);
  assert.match(migration, /config\.local_today \+ 7 AS birthday_on/);
  assert.match(migration, /extract\(year FROM config\.local_today \+ 7\)/);
  assert.match(migration, /WHEN 0 THEN 'Aniversário hoje: '/);
  assert.match(migration, /ELSE 'Aniversário em 7 dias: '/);
});

test("only eligible active individual clients are considered", () => {
  assert.match(migration, /client\.archived_at IS NULL/);
  assert.match(migration, /client\.status = 'ativo'/);
  assert.match(migration, /client\.person_type = 'pf'/);
  assert.match(migration, /client\.birth_date IS NOT NULL/);
  assert.match(migration, /client\.birth_date <= target\.birthday_on/);
  assert.match(migration, /organization\.archived_at IS NULL/);
  assert.match(migration, /clients_active_birthday_idx/);
  assert.match(migration, /extract\(month FROM birth_date\)/);
  assert.match(migration, /extract\(day FROM birth_date\)/);
});

test("leap-day birthdays use February 28 in non-leap years", () => {
  assert.match(migration, /extract\(month FROM client\.birth_date\) = 2/);
  assert.match(migration, /extract\(day FROM client\.birth_date\) = 29/);
  assert.match(migration, /target\.event_year % 400 = 0/);
  assert.match(migration, /extract\(day FROM target\.birthday_on\) = 28/);
});

test("the active owner receives the reminder and management is the fallback", () => {
  assert.match(migration, /member\.user_id = birthday\.owner_id/);
  assert.match(migration, /member\.is_active/);
  assert.match(
    migration,
    /manager\.role::text IN \([\s\S]*'superadmin', 'proprietario', 'administrador'[\s\S]*\)/,
  );
  assert.match(migration, /owner\.user_id = birthday\.owner_id/);
});

test("birthday reminders are configurable, annual, idempotent and limited", () => {
  assert.match(migration, /notification_preferences->>'client_birthdays'/);
  assert.match(migration, /'client-birthday:' \|\| recipient\.client_id::text/);
  assert.match(migration, /recipient\.event_year::text/);
  assert.match(migration, /recipient\.days_until_birthday::text/);
  assert.match(migration, /existing\.dedupe_key = candidate\.dedupe_key/);
  assert.match(migration, /LIMIT 200/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("the scan only creates internal notifications", () => {
  assert.match(migration, /INSERT INTO public\.notifications/);
  assert.match(migration, /'communication'/);
  assert.match(migration, /'\/clientes\/' \|\| candidate\.client_id::text/);
  assert.doesNotMatch(migration, /INSERT INTO public\.tasks/);
  assert.doesNotMatch(migration, /net\.http|https?:\/\/|service_role_key|anon_key/i);
});

test("the private helper reuses the single temporal clock", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_client_birthday_notifications\(timestamptz\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_client_birthday_notifications\(timestamptz\)[\s\S]*TO postgres/,
  );
  assert.match(migration, /create_client_birthday_notifications\(\)/);
  assert.match(migration, /CLIENT_BIRTHDAY_SCAN_FAILED/);
  assert.match(migration, /client_birthday_notifications_created/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
});

test("all earlier temporal stages remain present", () => {
  for (const stage of [
    "process_due_scheduled_automations",
    "process_due_financial_recurrences",
    "create_weekly_financial_summary_notifications",
    "create_weekly_data_quality_notifications",
    "create_stale_client_notifications",
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

test("settings, generated types and documentation expose the feature", () => {
  assert.match(settings, /client_birthdays: true/);
  assert.match(settingsPage, /Aniversários de clientes/);
  assert.match(types, /create_client_birthday_notifications:/);
  assert.match(docs, /## Aniversários de clientes/);
  assert.match(docs, /sete dias antes/);
  assert.match(docs, /29 de fevereiro/);
});
