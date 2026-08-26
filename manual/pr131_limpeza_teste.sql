-- PR #131 — SQL ÚNICO DE LIMPEZA DO TESTE FUNCIONAL
-- Remove/arquiva somente as fixtures identificadas da PR #131.
-- A migration, a função, as configurações e o relógio permanecem ativos.

BEGIN;

-- Arquiva as notificações geradas pelo teste da semana de 17/08/2026.
UPDATE public.notifications
SET archived_at = coalesce(archived_at, now())
WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND dedupe_key LIKE 'weekly-productivity-report:2026-08-17:%'
  AND title LIKE 'Produtividade semanal:%';

-- A execução simulada precisa sair antes da regra por causa da chave estrangeira.
DELETE FROM public.automation_executions
WHERE id = '61311300-0000-0000-0000-000000000001'
  AND organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND automation_rule_id = '81311300-0000-0000-0000-000000000001'
  AND dedupe_key = 'pr131-weekly-failed-fixture';

-- Arquiva somente as três tarefas exatas criadas pelo teste consolidado.
UPDATE public.tasks
SET archived_at = coalesce(archived_at, now()),
    updated_at = now()
WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND id IN (
    '41311300-0000-0000-0000-000000000001',
    '41311300-0000-0000-0000-000000000002',
    '41311300-0000-0000-0000-000000000003'
  )
  AND description = 'Fixture funcional consolidada da PR #131.';

-- Arquiva somente a regra temporária usada para produzir a falha controlada.
UPDATE public.automation_rules
SET archived_at = coalesce(archived_at, now()),
    is_active = false,
    updated_at = now()
WHERE id = '81311300-0000-0000-0000-000000000001'
  AND organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND name = 'TESTE PR 131 — Relatório semanal';

DO $validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.automation_executions
    WHERE id = '61311300-0000-0000-0000-000000000001'
       OR dedupe_key = 'pr131-weekly-failed-fixture'
  ) THEN
    RAISE EXCEPTION 'PR131_TEST_EXECUTION_NOT_REMOVED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND id IN (
        '41311300-0000-0000-0000-000000000001',
        '41311300-0000-0000-0000-000000000002',
        '41311300-0000-0000-0000-000000000003'
      )
      AND description = 'Fixture funcional consolidada da PR #131.'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PR131_TEST_TASKS_STILL_ACTIVE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.automation_rules
    WHERE id = '81311300-0000-0000-0000-000000000001'
      AND organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND (archived_at IS NULL OR is_active)
  ) THEN
    RAISE EXCEPTION 'PR131_TEST_RULE_STILL_ACTIVE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND dedupe_key LIKE 'weekly-productivity-report:2026-08-17:%'
      AND title LIKE 'Produtividade semanal:%'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PR131_TEST_NOTIFICATIONS_STILL_ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260826120000'
  ) OR to_regprocedure(
    'public.create_weekly_productivity_report_notifications(timestamptz)'
  ) IS NULL
  THEN
    RAISE EXCEPTION 'PR131_PRODUCTION_FEATURE_WAS_NOT_PRESERVED';
  END IF;

  IF (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ) <> 1 OR (
    SELECT command
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ) <> 'SELECT public.run_temporal_automation_cycle();'
  THEN
    RAISE EXCEPTION 'PR131_TEMPORAL_CLOCK_CHANGED';
  END IF;
END;
$validation$;

COMMIT;

SELECT
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND dedupe_key LIKE 'weekly-productivity-report:2026-08-17:%'
      AND title LIKE 'Produtividade semanal:%'
      AND archived_at IS NOT NULL
  ) AS notificacoes_teste_arquivadas,
  (
    SELECT count(*)
    FROM public.tasks
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND id IN (
        '41311300-0000-0000-0000-000000000001',
        '41311300-0000-0000-0000-000000000002',
        '41311300-0000-0000-0000-000000000003'
      )
      AND description = 'Fixture funcional consolidada da PR #131.'
      AND archived_at IS NOT NULL
  ) AS tarefas_teste_arquivadas,
  (
    SELECT count(*)
    FROM public.automation_executions
    WHERE id = '61311300-0000-0000-0000-000000000001'
       OR dedupe_key = 'pr131-weekly-failed-fixture'
  ) AS execucoes_teste_restantes,
  EXISTS (
    SELECT 1
    FROM public.automation_rules
    WHERE id = '81311300-0000-0000-0000-000000000001'
      AND archived_at IS NOT NULL
      AND NOT is_active
  ) AS regra_teste_arquivada,
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260826120000'
  ) AS migracao_preservada,
  to_regprocedure(
    'public.create_weekly_productivity_report_notifications(timestamptz)'
  ) IS NOT NULL AS funcao_preservada,
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ) AS quantidade_relogios,
  (
    SELECT command
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ) AS comando_relogio;

