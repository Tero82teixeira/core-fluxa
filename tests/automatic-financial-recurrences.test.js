import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260824220000_automatic_financial_recurrences.sql",
    import.meta.url,
  ),
  "utf8",
);
const route = readFileSync(
  new URL("../src/routes/_authenticated/financeiro.tsx", import.meta.url),
  "utf8",
);
const databaseTypes = readFileSync(
  new URL("../src/integrations/supabase/types.ts", import.meta.url),
  "utf8",
);
const docs = readFileSync(
  new URL("../docs/scheduled-automations.md", import.meta.url),
  "utf8",
);

describe("recorrências financeiras automáticas", () => {
  test("processa somente recorrências ativas, vencidas e de organizações ativas", () => {
    assert.match(migration, /recurrence\.status = 'active'/);
    assert.match(migration, /recurrence\.archived_at IS NULL/);
    assert.match(migration, /organization\.archived_at IS NULL/);
    assert.match(migration, /recurrence\.next_run_date <=/);
    assert.match(migration, /settings\.timezone/);
    assert.match(migration, /America\/Sao_Paulo/);
  });

  test("gera lançamentos pendentes sem movimentar saldo ou registrar pagamento", () => {
    assert.match(migration, /INSERT INTO public\.financial_transactions/);
    assert.match(migration, /recurrence_record\.created_by/);
    assert.match(migration, /recurrence_id,/);
    assert.match(migration, /recurrence_due_date,/);
    assert.doesNotMatch(
      migration,
      /INSERT INTO public\.financial_transaction_payments|UPDATE public\.financial_accounts/,
    );
  });

  test("impede duplicidade e limita a recuperação de atrasos", () => {
    assert.match(
      migration,
      /ON CONFLICT \(recurrence_id, recurrence_due_date\) DO NOTHING/,
    );
    assert.match(migration, /FOR UPDATE OF recurrence SKIP LOCKED/);
    assert.match(migration, /iteration_count < 120/);
    assert.match(migration, /next_run_date = run_date/);
  });

  test("mantém todas as etapas anteriores no relógio e isola falhas", () => {
    for (const existingStage of [
      "process_due_scheduled_automations",
      "create_critical_monitoring_notifications",
      "create_unassigned_monitoring_notifications",
      "create_deadline_reminder_notifications",
      "create_overdue_task_escalation_notifications",
      "create_stale_process_notifications",
      "create_overdue_communication_notifications",
      "create_expired_document_notifications",
      "create_overdue_financial_notifications",
    ]) {
      assert.match(migration, new RegExp(`${existingStage}\\(\\)`));
    }
    assert.match(migration, /process_due_financial_recurrences\(\)/);
    assert.match(migration, /FINANCIAL_RECURRENCE_SCAN_FAILED/);
    assert.match(migration, /financial_recurrence_transactions_created/);
  });

  test("mantém a função interna exclusiva do postgres e o cron único", () => {
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.process_due_financial_recurrences\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.process_due_financial_recurrences\(\)[\s\S]*TO postgres/,
    );
    assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
    assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
  });

  test("registra auditoria sistêmica somente quando há geração", () => {
    assert.match(migration, /INSERT INTO public\.audit_logs/);
    assert.match(migration, /'Automação'/);
    assert.match(migration, /'financial\.recurrence\.generated'/);
    assert.match(migration, /'automatic', true/);
    assert.match(migration, /IF generated_for_recurrence > 0 THEN/);
  });

  test("interface, tipos e documentação explicam o comportamento automático", () => {
    assert.match(route, /geradas automaticamente pelo relógio a cada 15\s+minutos/);
    assert.match(route, /Gerar pendentes agora/);
    assert.match(databaseTypes, /process_due_financial_recurrences:/);
    assert.match(docs, /Geração automática de lançamentos recorrentes/);
    assert.match(docs, /não movimenta saldo/);
  });
});
