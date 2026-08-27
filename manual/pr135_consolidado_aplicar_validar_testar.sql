-- PR #135 — aplicação idempotente, validação e preparação do teste visual.
-- Alvos exclusivos: uma categoria e uma conta identificadas como TESTE PR 135.

BEGIN;

CREATE OR REPLACE FUNCTION public.restore_financial_category(
  _organization_id uuid,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  category_id uuid := nullif(_payload->>'id', '')::uuid;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);

  UPDATE public.financial_categories
  SET archived_at = NULL,
      is_active = false
  WHERE id = category_id
    AND organization_id = _organization_id
    AND archived_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATEGORY_NOT_RESTORABLE';
  END IF;

  PERFORM public.financial_audit(
    _organization_id,
    'financial.category.restored',
    'financial_category',
    category_id
  );
  RETURN category_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_financial_account(
  _organization_id uuid,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  account_id uuid := nullif(_payload->>'id', '')::uuid;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);

  UPDATE public.financial_accounts
  SET archived_at = NULL,
      is_active = false
  WHERE id = account_id
    AND organization_id = _organization_id
    AND archived_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_RESTORABLE';
  END IF;

  PERFORM public.financial_audit(
    _organization_id,
    'financial.account.restored',
    'financial_account',
    account_id
  );
  RETURN account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_financial_category(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.restore_financial_account(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.restore_financial_category(uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_financial_account(uuid, jsonb)
  TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES (
  '20260827130000',
  'restore_financial_structures',
  ARRAY['applied by consolidated PR 135 production validation']
)
ON CONFLICT (version) DO NOTHING;

DO $validation$
BEGIN
  IF to_regprocedure(
       'public.restore_financial_category(uuid,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'public.restore_financial_account(uuid,jsonb)'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'PR135_RESTORE_FUNCTION_MISSING';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc
       WHERE oid IN (
         'public.restore_financial_category(uuid,jsonb)'::regprocedure,
         'public.restore_financial_account(uuid,jsonb)'::regprocedure
       )
         AND (
           NOT prosecdef
           OR NOT proconfig @> ARRAY[
             'search_path=pg_catalog, public, pg_temp'
           ]
         )
     )
  THEN
    RAISE EXCEPTION 'PR135_FUNCTION_SECURITY_CONFIGURATION_INVALID';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.restore_financial_category(uuid,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.restore_financial_account(uuid,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.restore_financial_category(uuid,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.restore_financial_account(uuid,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.restore_financial_category(uuid,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.restore_financial_account(uuid,jsonb)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'PR135_FUNCTION_PERMISSIONS_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND user_id = 'e975fd16-c4a0-4600-b586-b36a5b0a9d48'
      AND is_active
      AND role::text IN (
        'superadmin', 'proprietario', 'administrador', 'gestor', 'financeiro'
      )
  ) THEN
    RAISE EXCEPTION 'PR135_CONFIRMED_FINANCIAL_MEMBER_NOT_FOUND';
  END IF;
END;
$validation$;

-- Torna a execução repetível sem tocar em registros que não sejam do teste.
DELETE FROM public.audit_logs
WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND entity_id IN (
    '99913500-0000-0000-0000-000000000001',
    '99913500-0000-0000-0000-000000000002'
  );

DELETE FROM public.financial_categories
WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND (
    id = '99913500-0000-0000-0000-000000000001'
    OR name = 'TESTE PR 135 — Categoria arquivada'
  );

DELETE FROM public.financial_accounts
WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND (
    id = '99913500-0000-0000-0000-000000000002'
    OR name = 'TESTE PR 135 — Conta arquivada'
  );

INSERT INTO public.financial_categories(
  id,
  organization_id,
  name,
  type,
  description,
  color,
  is_active,
  archived_at,
  created_by
) VALUES (
  '99913500-0000-0000-0000-000000000001',
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30',
  'TESTE PR 135 — Categoria arquivada',
  'both',
  'Fixture controlada para validar a restauração da PR 135.',
  '#2563eb',
  false,
  now(),
  'e975fd16-c4a0-4600-b586-b36a5b0a9d48'
);

INSERT INTO public.financial_accounts(
  id,
  organization_id,
  name,
  type,
  description,
  initial_balance,
  current_balance,
  is_active,
  archived_at,
  created_by
) VALUES (
  '99913500-0000-0000-0000-000000000002',
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30',
  'TESTE PR 135 — Conta arquivada',
  'bank',
  'Fixture controlada para validar saldo e restauração da PR 135.',
  125,
  175,
  false,
  now(),
  'e975fd16-c4a0-4600-b586-b36a5b0a9d48'
);

-- Exercita as RPCs com a identidade confirmada.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  'e975fd16-c4a0-4600-b586-b36a5b0a9d48',
  true
);

SELECT public.restore_financial_category(
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30',
  '{"id":"99913500-0000-0000-0000-000000000001"}'::jsonb
);
SELECT public.restore_financial_account(
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30',
  '{"id":"99913500-0000-0000-0000-000000000002"}'::jsonb
);
RESET ROLE;

DO $restored_validation$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_categories
    WHERE id = '99913500-0000-0000-0000-000000000001'
      AND organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND archived_at IS NULL
      AND NOT is_active
  ) THEN
    RAISE EXCEPTION 'PR135_CATEGORY_RESTORE_FAILED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_accounts
    WHERE id = '99913500-0000-0000-0000-000000000002'
      AND organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND archived_at IS NULL
      AND NOT is_active
      AND initial_balance = 125
      AND current_balance = 175
  ) THEN
    RAISE EXCEPTION 'PR135_ACCOUNT_RESTORE_OR_BALANCE_VALIDATION_FAILED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audit_logs
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND entity = 'financial_category'
      AND entity_id = '99913500-0000-0000-0000-000000000001'
      AND action = 'financial.category.restored'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.audit_logs
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND entity = 'financial_account'
      AND entity_id = '99913500-0000-0000-0000-000000000002'
      AND action = 'financial.account.restored'
  ) THEN
    RAISE EXCEPTION 'PR135_RESTORE_AUDIT_NOT_FOUND';
  END IF;
END;
$restored_validation$;

-- Deixa ambos arquivados novamente para o teste visual na interface publicada.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  'e975fd16-c4a0-4600-b586-b36a5b0a9d48',
  true
);
SELECT public.archive_financial_category(
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30',
  '{"id":"99913500-0000-0000-0000-000000000001","confirmed":true}'::jsonb
);
SELECT public.archive_financial_account(
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30',
  '{"id":"99913500-0000-0000-0000-000000000002"}'::jsonb
);
RESET ROLE;

DO $final_validation$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_categories
    WHERE id = '99913500-0000-0000-0000-000000000001'
      AND organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND archived_at IS NOT NULL
      AND NOT is_active
  ) THEN
    RAISE EXCEPTION 'PR135_CATEGORY_NOT_READY_FOR_VISUAL_TEST';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_accounts
    WHERE id = '99913500-0000-0000-0000-000000000002'
      AND organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND archived_at IS NOT NULL
      AND NOT is_active
      AND initial_balance = 125
      AND current_balance = 175
  ) THEN
    RAISE EXCEPTION 'PR135_ACCOUNT_NOT_READY_FOR_VISUAL_TEST';
  END IF;
END;
$final_validation$;

COMMIT;

SELECT
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260827130000'
  ) AS migracao_registrada,
  to_regprocedure(
    'public.restore_financial_category(uuid,jsonb)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.restore_financial_account(uuid,jsonb)'
  ) IS NOT NULL AS funcoes_instaladas,
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
  ) AS permissoes_corretas,
  category.id AS categoria_id,
  category.name AS categoria,
  category.type AS categoria_tipo,
  category.archived_at IS NOT NULL AS categoria_arquivada,
  account.id AS conta_id,
  account.name AS conta,
  account.initial_balance AS saldo_inicial,
  account.current_balance AS saldo_atual,
  account.archived_at IS NOT NULL AS conta_arquivada,
  (
    SELECT count(*)
    FROM public.audit_logs
    WHERE organization_id = category.organization_id
      AND entity_id IN (category.id, account.id)
      AND action IN (
        'financial.category.restored',
        'financial.account.restored'
      )
  ) AS auditorias_de_restauracao,
  category.archived_at IS NOT NULL
    AND account.archived_at IS NOT NULL
    AND NOT category.is_active
    AND NOT account.is_active
    AND account.initial_balance = 125
    AND account.current_balance = 175
    AS pronto_para_teste_visual
FROM public.financial_categories AS category
CROSS JOIN public.financial_accounts AS account
WHERE category.id = '99913500-0000-0000-0000-000000000001'
  AND account.id = '99913500-0000-0000-0000-000000000002';
