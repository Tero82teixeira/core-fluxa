import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260826120000_weekly_productivity_report.sql", import.meta.url),
  "utf8",
);
const databaseTypes = readFileSync(
  new URL("../src/integrations/supabase/types.ts", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../src/lib/organization-settings.ts", import.meta.url),
  "utf8",
);
const settingsRoute = readFileSync(
  new URL("../src/routes/_authenticated/configuracoes.tsx", import.meta.url),
  "utf8",
);
const docs = readFileSync(new URL("../docs/scheduled-automations.md", import.meta.url), "utf8");

describe("relatório semanal de produtividade", () => {
  test("executa somente na segunda-feira após 08:00 no fuso da organização", () => {
    assert.match(migration, /\) = 1/);
    assert.match(migration, /::time >= time '08:00'/);
    assert.match(migration, /pg_catalog\.pg_timezone_names/);
    assert.match(migration, /America\/Sao_Paulo/);
    assert.match(migration, /organization\.archived_at IS NULL/);
  });

  test("mede a semana anterior e o estado operacional atual", () => {
    for (const metric of [
      "completed_tasks",
      "pending_tasks",
      "overdue_tasks",
      "failed_automations",
      "responsibility_summary",
    ]) {
      assert.match(migration, new RegExp(metric));
    }
    assert.match(migration, /current_week_start - 7/);
    assert.match(migration, /current_week_start - 1/);
    assert.match(migration, /Sem responsável/);
    assert.match(migration, /position <= 5/);
  });

  test("notifica somente gestão ativa e não altera dados operacionais", () => {
    assert.match(
      migration,
      /member\.role::text IN \(\s*'superadmin', 'proprietario', 'administrador', 'gestor'\s*\)/,
    );
    assert.match(migration, /member\.is_active/);
    assert.match(migration, /Produtividade semanal/);
    assert.match(migration, /'\/relatorios'/);
    assert.doesNotMatch(
      migration,
      /(?:UPDATE|DELETE|INSERT INTO) public\.(?:tasks|automation_executions|organization_members)/,
    );
  });

  test("é privado, idempotente, configurável e usa o relógio único", () => {
    assert.match(migration, /weekly-productivity-report:/);
    assert.match(migration, /ON CONFLICT DO NOTHING/);
    assert.match(migration, /weekly_productivity_report/);
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.create_weekly_productivity_report_notifications[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.create_weekly_productivity_report_notifications[\s\S]*TO postgres/,
    );
    assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
    assert.doesNotMatch(migration, /https?:\/\/|service_role_key|anon_key/i);
  });

  test("preserva todas as etapas anteriores e isola falhas", () => {
    for (const stage of [
      "process_due_scheduled_automations",
      "create_daily_operational_close_notifications",
      "process_due_financial_recurrences",
      "create_weekly_financial_summary_notifications",
      "create_weekly_data_quality_notifications",
      "create_stale_client_notifications",
      "create_client_birthday_notifications",
      "create_stale_lead_notifications",
      "create_stale_task_notifications",
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
    assert.match(migration, /create_weekly_productivity_report_notifications\(\)/);
    assert.match(migration, /WEEKLY_PRODUCTIVITY_REPORT_FAILED/);
    assert.match(migration, /weekly_productivity_reports_created/);
  });

  test("tipos, configurações e documentação expõem o recurso", () => {
    assert.match(databaseTypes, /create_weekly_productivity_report_notifications:/);
    assert.match(settings, /weekly_productivity_report: true/);
    assert.match(settingsRoute, /Relatório semanal de produtividade/);
    assert.match(docs, /Relatório semanal de produtividade/);
    assert.match(docs, /segunda-feira/);
    assert.match(docs, /não modifica nenhuma tarefa/);
  });
});
