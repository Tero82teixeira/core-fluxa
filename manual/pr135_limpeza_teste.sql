-- PR #135 — limpeza única das fixtures do teste visual.
-- Preserva migration, funções, permissões e todos os registros reais.

BEGIN;

DELETE FROM public.audit_logs
WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND entity_id IN (
    '99913500-0000-0000-0000-000000000001',
    '99913500-0000-0000-0000-000000000002'
  );

DELETE FROM public.financial_categories
WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND id = '99913500-0000-0000-0000-000000000001'
  AND name = 'TESTE PR 135 — Categoria arquivada';

DELETE FROM public.financial_accounts
WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND id = '99913500-0000-0000-0000-000000000002'
  AND name = 'TESTE PR 135 — Conta arquivada';

DO $validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.financial_categories
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND id = '99913500-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'PR135_TEST_CATEGORY_NOT_REMOVED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.financial_accounts
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND id = '99913500-0000-0000-0000-000000000002'
  ) THEN
    RAISE EXCEPTION 'PR135_TEST_ACCOUNT_NOT_REMOVED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.audit_logs
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND entity_id IN (
        '99913500-0000-0000-0000-000000000001',
        '99913500-0000-0000-0000-000000000002'
      )
  ) THEN
    RAISE EXCEPTION 'PR135_TEST_AUDIT_NOT_REMOVED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260827130000'
  ) THEN
    RAISE EXCEPTION 'PR135_MIGRATION_WAS_NOT_PRESERVED';
  END IF;

  IF to_regprocedure(
       'public.restore_financial_category(uuid,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'public.restore_financial_account(uuid,jsonb)'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'PR135_RESTORE_FUNCTION_WAS_NOT_PRESERVED';
  END IF;
END;
$validation$;

COMMIT;

SELECT
  NOT EXISTS (
    SELECT 1
    FROM public.financial_categories
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND id = '99913500-0000-0000-0000-000000000001'
  ) AS categoria_teste_removida,
  NOT EXISTS (
    SELECT 1
    FROM public.financial_accounts
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND id = '99913500-0000-0000-0000-000000000002'
  ) AS conta_teste_removida,
  NOT EXISTS (
    SELECT 1
    FROM public.audit_logs
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND entity_id IN (
        '99913500-0000-0000-0000-000000000001',
        '99913500-0000-0000-0000-000000000002'
      )
  ) AS auditorias_teste_removidas,
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260827130000'
  ) AS migracao_preservada,
  to_regprocedure(
    'public.restore_financial_category(uuid,jsonb)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.restore_financial_account(uuid,jsonb)'
  ) IS NOT NULL AS funcoes_preservadas,
  has_function_privilege(
    'authenticated',
    'public.restore_financial_category(uuid,jsonb)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.restore_financial_account(uuid,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.restore_financial_category(uuid,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.restore_financial_account(uuid,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.restore_financial_category(uuid,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.restore_financial_account(uuid,jsonb)',
    'EXECUTE'
  ) AS permissoes_preservadas;
