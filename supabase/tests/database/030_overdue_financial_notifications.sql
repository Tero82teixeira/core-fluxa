BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SELECT no_plan();

SELECT has_function(
  'public', 'create_overdue_financial_notifications', ARRAY[]::text[],
  'private overdue-financial notification helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.create_overdue_financial_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_overdue_financial_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_overdue_financial_notifications()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres', 'public.create_overdue_financial_notifications()', 'EXECUTE'
  ),
  'only postgres can invoke the overdue-financial helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('19400000-0000-0000-0000-000000000001', 'finance-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19400000-0000-0000-0000-000000000002', 'finance-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19400000-0000-0000-0000-000000000003', 'finance-manager@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19400000-0000-0000-0000-000000000004', 'finance-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19400000-0000-0000-0000-000000000005', 'finance-disabled@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19400000-0000-0000-0000-000000000006', 'finance-hidden@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name) VALUES
  ('29400000-0000-0000-0000-000000000001', 'Overdue Finance Tenant'),
  ('29400000-0000-0000-0000-000000000002', 'Disabled Finance Tenant'),
  ('29400000-0000-0000-0000-000000000003', 'Hidden Finance Tenant');

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  ('29400000-0000-0000-0000-000000000001', '19400000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29400000-0000-0000-0000-000000000001', '19400000-0000-0000-0000-000000000002', 'administrador', true),
  ('29400000-0000-0000-0000-000000000001', '19400000-0000-0000-0000-000000000003', 'gestor', true),
  ('29400000-0000-0000-0000-000000000001', '19400000-0000-0000-0000-000000000004', 'operacional', true),
  ('29400000-0000-0000-0000-000000000002', '19400000-0000-0000-0000-000000000005', 'proprietario', true),
  ('29400000-0000-0000-0000-000000000003', '19400000-0000-0000-0000-000000000006', 'proprietario', true);

INSERT INTO public.organization_settings(
  organization_id, timezone, monitoring_show_financial
) VALUES
  ('29400000-0000-0000-0000-000000000001', 'America/Sao_Paulo', true),
  ('29400000-0000-0000-0000-000000000002', 'America/Sao_Paulo', true),
  ('29400000-0000-0000-0000-000000000003', 'America/Sao_Paulo', false);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{overdue_accounts}', 'false'::jsonb, true
)
WHERE organization_id = '29400000-0000-0000-0000-000000000002';

INSERT INTO public.financial_accounts(
  id, organization_id, name, type, created_by
) VALUES (
  '39400000-0000-0000-0000-000000000001',
  '29400000-0000-0000-0000-000000000001',
  'Test account', 'bank',
  '19400000-0000-0000-0000-000000000001'
);

INSERT INTO public.financial_transactions(
  id, organization_id, type, description, amount, status, due_date,
  responsible_user_id, created_by
) VALUES
  ('79400000-0000-0000-0000-000000000001', '29400000-0000-0000-0000-000000000001', 'income', 'One day receivable', 1000, 'pending', current_date - 1, '19400000-0000-0000-0000-000000000003', '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000002', '29400000-0000-0000-0000-000000000001', 'expense', 'Eight day payable', 500, 'overdue', current_date - 8, '19400000-0000-0000-0000-000000000003', '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000003', '29400000-0000-0000-0000-000000000001', 'income', 'Long unassigned receivable', 900, 'pending', current_date - 35, NULL, '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000004', '29400000-0000-0000-0000-000000000001', 'expense', 'Critical payable', 600, 'pending', current_date - 8, NULL, '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000005', '29400000-0000-0000-0000-000000000001', 'income', 'Resolved receivable', 100, 'pending', current_date - 1, NULL, '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000006', '29400000-0000-0000-0000-000000000001', 'income', 'Ignored receivable', 100, 'pending', current_date - 1, NULL, '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000007', '29400000-0000-0000-0000-000000000001', 'expense', 'Archived payable', 100, 'pending', current_date - 1, NULL, '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000008', '29400000-0000-0000-0000-000000000001', 'income', 'Paid receivable', 100, 'paid', current_date - 1, NULL, '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000009', '29400000-0000-0000-0000-000000000001', 'expense', 'Due today', 100, 'pending', current_date, NULL, '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000010', '29400000-0000-0000-0000-000000000001', 'income', 'Partial receivable', 100, 'partial', current_date - 1, '19400000-0000-0000-0000-000000000003', '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000011', '29400000-0000-0000-0000-000000000001', 'income', 'Settled balance', 100, 'pending', current_date - 1, NULL, '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000014', '29400000-0000-0000-0000-000000000001', 'income', 'Operator assignment', 100, 'pending', current_date - 1, '19400000-0000-0000-0000-000000000004', '19400000-0000-0000-0000-000000000001'),
  ('79400000-0000-0000-0000-000000000012', '29400000-0000-0000-0000-000000000002', 'income', 'Preference disabled', 100, 'pending', current_date - 1, NULL, '19400000-0000-0000-0000-000000000005'),
  ('79400000-0000-0000-0000-000000000013', '29400000-0000-0000-0000-000000000003', 'income', 'Hidden finance', 100, 'pending', current_date - 1, NULL, '19400000-0000-0000-0000-000000000006');

UPDATE public.financial_transactions
SET archived_at = now()
WHERE id = '79400000-0000-0000-0000-000000000007';

INSERT INTO public.financial_transaction_payments(
  id, organization_id, transaction_id, amount, paid_at, account_id, created_by
) VALUES
  ('89400000-0000-0000-0000-000000000001', '29400000-0000-0000-0000-000000000001', '79400000-0000-0000-0000-000000000010', 40, now(), '39400000-0000-0000-0000-000000000001', '19400000-0000-0000-0000-000000000001'),
  ('89400000-0000-0000-0000-000000000002', '29400000-0000-0000-0000-000000000001', '79400000-0000-0000-0000-000000000011', 100, now(), '39400000-0000-0000-0000-000000000001', '19400000-0000-0000-0000-000000000001');

INSERT INTO public.monitoring_states(
  id, organization_id, source_type, source_id, alert_kind,
  monitoring_status, assigned_to, priority_override
) VALUES
  ('59400000-0000-0000-0000-000000000001', '29400000-0000-0000-0000-000000000001', 'financeiro', '79400000-0000-0000-0000-000000000001', 'financeiro_vencido', 'novo', '19400000-0000-0000-0000-000000000003', 'alta'),
  ('59400000-0000-0000-0000-000000000002', '29400000-0000-0000-0000-000000000001', 'financeiro', '79400000-0000-0000-0000-000000000002', 'financeiro_vencido', 'novo', NULL, 'alta'),
  ('59400000-0000-0000-0000-000000000003', '29400000-0000-0000-0000-000000000001', 'financeiro', '79400000-0000-0000-0000-000000000003', 'financeiro_vencido', 'novo', NULL, 'alta'),
  ('59400000-0000-0000-0000-000000000005', '29400000-0000-0000-0000-000000000001', 'financeiro', '79400000-0000-0000-0000-000000000005', 'financeiro_vencido', 'resolvido', NULL, NULL),
  ('59400000-0000-0000-0000-000000000006', '29400000-0000-0000-0000-000000000001', 'financeiro', '79400000-0000-0000-0000-000000000006', 'financeiro_vencido', 'ignorado', NULL, NULL);

SELECT is(
  public.create_overdue_financial_notifications(), 9,
  'the three overdue stages create exactly nine recipient notifications'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '79400000-0000-0000-0000-000000000001'
     AND user_id = '19400000-0000-0000-0000-000000000003'
     AND title LIKE 'Recebimento vencido:%'
     AND dedupe_key LIKE 'overdue-financial:%'),
  1::bigint,
  'the authorized responsible receives the first receivable notice'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '79400000-0000-0000-0000-000000000002'
     AND title LIKE 'Escalonamento — conta vencida:%'
     AND dedupe_key LIKE 'overdue-financial:%'),
  3::bigint,
  'after seven days the responsible and active management are notified'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '79400000-0000-0000-0000-000000000003'
     AND title LIKE 'Alerta prolongado — conta vencida:%'
     AND dedupe_key LIKE 'overdue-financial:%'),
  2::bigint,
  'a long-running unassigned receivable notifies active management'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '79400000-0000-0000-0000-000000000010'
     AND body LIKE '%Saldo em aberto: R$ 60%'),
  1::bigint,
  'partial payments leave only the open balance in the notice'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '79400000-0000-0000-0000-000000000014'
     AND user_id IN (
       '19400000-0000-0000-0000-000000000001',
       '19400000-0000-0000-0000-000000000002'
     )),
  2::bigint,
  'financial details fall back to authorized management roles'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id IN (
     '79400000-0000-0000-0000-000000000004',
     '79400000-0000-0000-0000-000000000005',
     '79400000-0000-0000-0000-000000000006',
     '79400000-0000-0000-0000-000000000007',
     '79400000-0000-0000-0000-000000000008',
     '79400000-0000-0000-0000-000000000009',
     '79400000-0000-0000-0000-000000000011',
     '79400000-0000-0000-0000-000000000012',
     '79400000-0000-0000-0000-000000000013'
   ) AND dedupe_key LIKE 'overdue-financial:%'),
  0::bigint,
  'critical, resolved, ignored, archived, settled, disabled and current items are excluded'
);
SELECT is(
  public.create_overdue_financial_notifications(), 0,
  'replaying the same financial episode creates no duplicate'
);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{critical_monitoring}', 'false'::jsonb, true
)
WHERE organization_id = '29400000-0000-0000-0000-000000000001';
SELECT is(
  public.create_overdue_financial_notifications(), 2,
  'a critical account gets management notices when critical alerts are off'
);
SELECT is(
  public.create_overdue_financial_notifications(), 0,
  'the critical-preference fallback is idempotent'
);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{critical_monitoring}', 'true'::jsonb, true
)
WHERE organization_id = '29400000-0000-0000-0000-000000000001';
UPDATE public.financial_transactions
SET due_date = current_date - 8
WHERE id = '79400000-0000-0000-0000-000000000001';
SELECT is(
  public.create_overdue_financial_notifications(), 3,
  'a changed due date can start a new escalated episode'
);
SELECT is(
  public.create_overdue_financial_notifications(), 0,
  'the changed financial episode remains idempotent on replay'
);

SELECT is(
  (SELECT status FROM public.financial_transactions
   WHERE id = '79400000-0000-0000-0000-000000000001'),
  'pending',
  'the scan never changes the financial status'
);
SELECT is(
  (SELECT count(*) FROM public.tasks
   WHERE organization_id = '29400000-0000-0000-0000-000000000001'),
  0::bigint,
  'the scan never creates a task'
);
SELECT is(
  (SELECT count(*) FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  1::bigint,
  'overdue-financial notifications create no additional clock'
);
SELECT is(
  (SELECT command FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'SELECT public.run_temporal_automation_cycle();',
  'the existing private temporal command remains unchanged'
);

SELECT * FROM finish();
ROLLBACK;
