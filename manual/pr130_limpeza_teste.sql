-- Limpeza segura do teste funcional da PR #130
-- Remove somente os dados identificados exclusivamente como fixture da PR #130.
-- A migration, as funções e a configuração definitiva da distribuição permanecem instaladas.

BEGIN;

WITH tarefas_arquivadas AS (
  UPDATE public.tasks
  SET archived_at = coalesce(archived_at, now()),
      updated_at = now()
  WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
    AND title = 'TESTE PR 130 — Distribuição automática'
    AND description = 'Fixture funcional consolidada da PR #130.'
    AND archived_at IS NULL
  RETURNING id
),
execucoes_removidas AS (
  DELETE FROM public.automation_executions
  WHERE automation_rule_id = '81301300-0000-0000-0000-000000000001'
    AND entity_id = '91301300-0000-0000-0000-000000000001'
  RETURNING id
),
regra_arquivada AS (
  UPDATE public.automation_rules
  SET is_active = false,
      archived_at = coalesce(archived_at, now()),
      updated_at = now()
  WHERE id = '81301300-0000-0000-0000-000000000001'
    AND organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  RETURNING id
),
perfil_teste_limpo AS (
  UPDATE public.organization_members
  SET distribution_sector = NULL,
      distribution_function = NULL,
      automatic_task_capacity = 20,
      receives_automatic_tasks = false,
      last_automatic_task_at = NULL,
      updated_at = now()
  WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
    AND user_id = 'e975fd16-c4a0-4600-b586-b36a5b0a9d48'
    AND distribution_sector = 'Setor de teste PR 130'
    AND distribution_function = 'Responsável de teste'
  RETURNING user_id
)
SELECT
  (SELECT count(*) FROM tarefas_arquivadas) AS tarefas_teste_arquivadas,
  (SELECT count(*) FROM execucoes_removidas) AS execucoes_teste_removidas,
  (SELECT count(*) FROM regra_arquivada) AS regras_teste_arquivadas,
  (SELECT count(*) FROM perfil_teste_limpo) AS perfis_teste_restaurados,
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260826010000'
  ) AS migracao_pr130_preservada,
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ) AS quantidade_relogios;

COMMIT;
