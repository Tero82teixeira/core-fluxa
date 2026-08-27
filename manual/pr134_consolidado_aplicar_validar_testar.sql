-- PR #134 — aplicação idempotente, validação e preparação do teste visual.
-- Alvo exclusivo: lançamento TESTE PR 132 — Editado da organização já confirmada.

BEGIN;

CREATE OR REPLACE FUNCTION public.restore_financial_transaction(
  _organization_id uuid,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  transaction_id uuid := nullif(_payload->>'id', '')::uuid;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);

  UPDATE public.financial_transactions
  SET archived_at = NULL
  WHERE id = transaction_id
    AND organization_id = _organization_id
    AND archived_at IS NOT NULL
    AND status IN ('paid', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSACTION_NOT_RESTORABLE';
  END IF;

  PERFORM public.financial_audit(
    _organization_id,
    'financial.transaction.restored',
    'financial_transaction',
    transaction_id
  );
  RETURN transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_financial_transaction(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.restore_financial_transaction(uuid, jsonb)
  TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES (
  '20260827120000',
  'restore_financial_transactions',
  ARRAY['applied by consolidated PR 134 production validation']
)
ON CONFLICT (version) DO NOTHING;

DO $validation$
DECLARE
  target_count integer;
BEGIN
  IF to_regprocedure(
       'public.restore_financial_transaction(uuid,jsonb)'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'PR134_FUNCTION_MISSING';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc
       WHERE oid =
         'public.restore_financial_transaction(uuid,jsonb)'::regprocedure
         AND prosecdef
         AND proconfig @> ARRAY[
           'search_path=pg_catalog, public, pg_temp'
         ]
     )
  THEN
    RAISE EXCEPTION 'PR134_FUNCTION_SECURITY_CONFIGURATION_INVALID';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         coalesce(procedure.proacl, acldefault('f', procedure.proowner))
       ) AS privilege
       WHERE procedure.oid =
         'public.restore_financial_transaction(uuid,jsonb)'::regprocedure
         AND privilege.grantee = 0
         AND privilege.privilege_type = 'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.restore_financial_transaction(uuid,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.restore_financial_transaction(uuid,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.restore_financial_transaction(uuid,jsonb)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'PR134_FUNCTION_PERMISSIONS_INVALID';
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
    RAISE EXCEPTION 'PR134_CONFIRMED_FINANCIAL_MEMBER_NOT_FOUND';
  END IF;

  SELECT count(*) INTO target_count
  FROM public.financial_transactions
  WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
    AND description = 'TESTE PR 132 — Editado'
    AND type = 'income'
    AND amount = 150
    AND due_date = DATE '2026-08-27'
    AND status = 'cancelled'
    AND archived_at IS NOT NULL;

  IF target_count <> 1 THEN
    RAISE EXCEPTION 'PR134_EXPECTED_SINGLE_ARCHIVED_TEST_TRANSACTION_FOUND_%',
      target_count;
  END IF;
END;
$validation$;

-- Exercita a RPC com a identidade confirmada e deixa o mesmo lançamento
-- arquivado novamente para o teste visual na interface publicada.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  'e975fd16-c4a0-4600-b586-b36a5b0a9d48',
  true
);

SELECT public.restore_financial_transaction(
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30',
  jsonb_build_object(
    'id',
    (
      SELECT id
      FROM public.financial_transactions
      WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
        AND description = 'TESTE PR 132 — Editado'
        AND type = 'income'
        AND amount = 150
        AND due_date = DATE '2026-08-27'
        AND status = 'cancelled'
        AND archived_at IS NOT NULL
    )
  )
);

SELECT public.archive_financial_transaction(
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30',
  jsonb_build_object(
    'id',
    (
      SELECT id
      FROM public.financial_transactions
      WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
        AND description = 'TESTE PR 132 — Editado'
        AND type = 'income'
        AND amount = 150
        AND due_date = DATE '2026-08-27'
        AND status = 'cancelled'
        AND archived_at IS NULL
    )
  )
);
RESET ROLE;

DO $functional_validation$
DECLARE
  target_id uuid;
BEGIN
  SELECT id INTO target_id
  FROM public.financial_transactions
  WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
    AND description = 'TESTE PR 132 — Editado'
    AND type = 'income'
    AND amount = 150
    AND due_date = DATE '2026-08-27'
    AND status = 'cancelled'
    AND archived_at IS NOT NULL;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'PR134_TEST_TRANSACTION_NOT_READY_FOR_VISUAL_RESTORE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audit_logs
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND entity = 'financial_transaction'
      AND entity_id = target_id
      AND action = 'financial.transaction.restored'
  ) THEN
    RAISE EXCEPTION 'PR134_RESTORE_AUDIT_NOT_FOUND';
  END IF;
END;
$functional_validation$;

COMMIT;

SELECT
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260827120000'
  ) AS migracao_registrada,
  to_regprocedure(
    'public.restore_financial_transaction(uuid,jsonb)'
  ) IS NOT NULL AS funcao_instalada,
  has_function_privilege(
    'authenticated',
    'public.restore_financial_transaction(uuid,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.restore_financial_transaction(uuid,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.restore_financial_transaction(uuid,jsonb)',
    'EXECUTE'
  ) AS permissoes_corretas,
  transaction.id AS lancamento_id,
  transaction.description AS descricao,
  transaction.type AS tipo,
  transaction.amount AS valor,
  transaction.due_date AS vencimento,
  transaction.status,
  transaction.archived_at IS NOT NULL AS arquivado,
  (
    SELECT count(*)
    FROM public.audit_logs
    WHERE organization_id = transaction.organization_id
      AND entity = 'financial_transaction'
      AND entity_id = transaction.id
      AND action = 'financial.transaction.restored'
  ) AS auditorias_de_restauracao,
  transaction.archived_at IS NOT NULL
    AND transaction.status = 'cancelled'
    AS pronto_para_teste_visual
FROM public.financial_transactions AS transaction
WHERE transaction.organization_id =
      'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND transaction.description = 'TESTE PR 132 — Editado'
  AND transaction.type = 'income'
  AND transaction.amount = 150
  AND transaction.due_date = DATE '2026-08-27'
  AND transaction.status = 'cancelled'
  AND transaction.archived_at IS NOT NULL;
