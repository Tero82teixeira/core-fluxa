BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SELECT no_plan();

SELECT has_function(
  'public', 'create_expired_document_notifications', ARRAY[]::text[],
  'private expired-document notification helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.create_expired_document_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_expired_document_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_expired_document_notifications()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres', 'public.create_expired_document_notifications()', 'EXECUTE'
  ),
  'only postgres can invoke the expired-document helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('19320000-0000-0000-0000-000000000001', 'expired-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19320000-0000-0000-0000-000000000002', 'expired-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19320000-0000-0000-0000-000000000003', 'expired-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19320000-0000-0000-0000-000000000004', 'expired-disabled@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19320000-0000-0000-0000-000000000005', 'expired-hidden@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name) VALUES
  ('29320000-0000-0000-0000-000000000001', 'Expired Document Tenant'),
  ('29320000-0000-0000-0000-000000000002', 'Disabled Document Tenant'),
  ('29320000-0000-0000-0000-000000000003', 'Hidden Document Tenant');

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  ('29320000-0000-0000-0000-000000000001', '19320000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29320000-0000-0000-0000-000000000001', '19320000-0000-0000-0000-000000000002', 'administrador', true),
  ('29320000-0000-0000-0000-000000000001', '19320000-0000-0000-0000-000000000003', 'operacional', true),
  ('29320000-0000-0000-0000-000000000002', '19320000-0000-0000-0000-000000000004', 'proprietario', true),
  ('29320000-0000-0000-0000-000000000003', '19320000-0000-0000-0000-000000000005', 'proprietario', true);

INSERT INTO public.organization_settings(
  organization_id, timezone, monitoring_show_documents
) VALUES
  ('29320000-0000-0000-0000-000000000001', 'America/Sao_Paulo', true),
  ('29320000-0000-0000-0000-000000000002', 'America/Sao_Paulo', true),
  ('29320000-0000-0000-0000-000000000003', 'America/Sao_Paulo', false);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{expiring_documents}', 'false'::jsonb, true
)
WHERE organization_id = '29320000-0000-0000-0000-000000000002';

INSERT INTO public.documents(
  id, organization_id, title, expiration_date, status, file_path,
  original_file_name, stored_file_name, file_extension, mime_type, file_size
) VALUES
  ('49320000-0000-0000-0000-000000000001', '29320000-0000-0000-0000-000000000001', 'One day expired assigned', current_date - 1, 'aprovado', 'test/expired-01.pdf', 'expired-01.pdf', 'expired-01.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000002', '29320000-0000-0000-0000-000000000001', 'Seven day escalation', current_date - 8, 'aprovado', 'test/expired-02.pdf', 'expired-02.pdf', 'expired-02.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000003', '29320000-0000-0000-0000-000000000001', 'Thirty day escalation', current_date - 35, 'vencido', 'test/expired-03.pdf', 'expired-03.pdf', 'expired-03.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000004', '29320000-0000-0000-0000-000000000001', 'Manager is responsible', current_date - 8, 'aprovado', 'test/expired-04.pdf', 'expired-04.pdf', 'expired-04.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000005', '29320000-0000-0000-0000-000000000001', 'Critical document', current_date - 8, 'aprovado', 'test/expired-05.pdf', 'expired-05.pdf', 'expired-05.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000006', '29320000-0000-0000-0000-000000000001', 'Resolved document', current_date - 1, 'aprovado', 'test/expired-06.pdf', 'expired-06.pdf', 'expired-06.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000007', '29320000-0000-0000-0000-000000000001', 'Archived document', current_date - 8, 'aprovado', 'test/expired-07.pdf', 'expired-07.pdf', 'expired-07.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000008', '29320000-0000-0000-0000-000000000001', 'Archived status document', current_date - 8, 'arquivado', 'test/expired-08.pdf', 'expired-08.pdf', 'expired-08.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000009', '29320000-0000-0000-0000-000000000002', 'Preference disabled document', current_date - 1, 'aprovado', 'test/expired-09.pdf', 'expired-09.pdf', 'expired-09.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000010', '29320000-0000-0000-0000-000000000003', 'Hidden document', current_date - 1, 'aprovado', 'test/expired-10.pdf', 'expired-10.pdf', 'expired-10.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000011', '29320000-0000-0000-0000-000000000001', 'Expires today', current_date, 'aprovado', 'test/expired-11.pdf', 'expired-11.pdf', 'expired-11.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000012', '29320000-0000-0000-0000-000000000001', 'No expiration', NULL, 'aprovado', 'test/expired-12.pdf', 'expired-12.pdf', 'expired-12.pdf', 'pdf', 'application/pdf', 100),
  ('49320000-0000-0000-0000-000000000013', '29320000-0000-0000-0000-000000000001', 'Ignored document', current_date - 1, 'aprovado', 'test/expired-13.pdf', 'expired-13.pdf', 'expired-13.pdf', 'pdf', 'application/pdf', 100);

UPDATE public.documents
SET archived_at = now()
WHERE id = '49320000-0000-0000-0000-000000000007';

INSERT INTO public.monitoring_states(
  id, organization_id, source_type, source_id, alert_kind,
  monitoring_status, assigned_to, priority_override
) VALUES
  ('59320000-0000-0000-0000-000000000001', '29320000-0000-0000-0000-000000000001', 'documento', '49320000-0000-0000-0000-000000000001', 'documento_vencido', 'novo', '19320000-0000-0000-0000-000000000002', NULL),
  ('59320000-0000-0000-0000-000000000002', '29320000-0000-0000-0000-000000000001', 'documento', '49320000-0000-0000-0000-000000000002', 'documento_vencido', 'novo', '19320000-0000-0000-0000-000000000003', 'alta'),
  ('59320000-0000-0000-0000-000000000003', '29320000-0000-0000-0000-000000000001', 'documento', '49320000-0000-0000-0000-000000000003', 'documento_vencido', 'novo', NULL, 'alta'),
  ('59320000-0000-0000-0000-000000000004', '29320000-0000-0000-0000-000000000001', 'documento', '49320000-0000-0000-0000-000000000004', 'documento_vencido', 'novo', '19320000-0000-0000-0000-000000000001', 'alta'),
  ('59320000-0000-0000-0000-000000000006', '29320000-0000-0000-0000-000000000001', 'documento', '49320000-0000-0000-0000-000000000006', 'documento_vencido', 'resolvido', NULL, NULL),
  ('59320000-0000-0000-0000-000000000013', '29320000-0000-0000-0000-000000000001', 'documento', '49320000-0000-0000-0000-000000000013', 'documento_vencido', 'ignorado', NULL, NULL);

SELECT is(
  public.create_expired_document_notifications(), 8,
  'the three overdue stages create exactly eight recipient notifications'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49320000-0000-0000-0000-000000000001'
     AND user_id = '19320000-0000-0000-0000-000000000002'
     AND dedupe_key LIKE 'expired-document:%'),
  1::bigint,
  'the active monitoring assignee receives the first overdue notice'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49320000-0000-0000-0000-000000000002'
     AND dedupe_key LIKE 'expired-document:%'),
  3::bigint,
  'after seven days the responsible and active management are notified'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49320000-0000-0000-0000-000000000003'
     AND dedupe_key LIKE 'expired-document:%'),
  2::bigint,
  'a long-running unassigned expiry notifies active management'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49320000-0000-0000-0000-000000000004'
     AND dedupe_key LIKE 'expired-document:%'),
  2::bigint,
  'a manager who is responsible receives the escalated notice only once'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id IN (
     '49320000-0000-0000-0000-000000000005',
     '49320000-0000-0000-0000-000000000006',
     '49320000-0000-0000-0000-000000000007',
     '49320000-0000-0000-0000-000000000008',
     '49320000-0000-0000-0000-000000000009',
     '49320000-0000-0000-0000-000000000010',
     '49320000-0000-0000-0000-000000000011',
     '49320000-0000-0000-0000-000000000012',
     '49320000-0000-0000-0000-000000000013'
   ) AND dedupe_key LIKE 'expired-document:%'),
  0::bigint,
  'critical, resolved, ignored, archived, disabled and non-expired items are excluded'
);
SELECT is(
  public.create_expired_document_notifications(), 0,
  'replaying the same expiration episode creates no duplicate'
);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{critical_monitoring}', 'false'::jsonb, true
)
WHERE organization_id = '29320000-0000-0000-0000-000000000001';
SELECT is(
  public.create_expired_document_notifications(), 2,
  'a critical document gets management notices when critical alerts are off'
);
SELECT is(
  public.create_expired_document_notifications(), 0,
  'the critical-preference fallback is idempotent'
);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{critical_monitoring}', 'true'::jsonb, true
)
WHERE organization_id = '29320000-0000-0000-0000-000000000001';
UPDATE public.monitoring_states
SET priority_override = 'alta'
WHERE id = '59320000-0000-0000-0000-000000000001';
UPDATE public.documents
SET expiration_date = current_date - 8
WHERE id = '49320000-0000-0000-0000-000000000001';
SELECT is(
  public.create_expired_document_notifications(), 2,
  'a changed expiration date can start a new escalated episode'
);
SELECT is(
  public.create_expired_document_notifications(), 0,
  'the changed expiration episode remains idempotent on replay'
);

SELECT is(
  (SELECT status::text FROM public.documents
   WHERE id = '49320000-0000-0000-0000-000000000001'),
  'aprovado',
  'the scan never changes the document status'
);
SELECT is(
  (SELECT count(*) FROM public.tasks
   WHERE organization_id = '29320000-0000-0000-0000-000000000001'),
  0::bigint,
  'the scan never creates a task'
);
SELECT is(
  (SELECT count(*) FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  1::bigint,
  'expired-document notifications create no additional clock'
);
SELECT is(
  (SELECT command FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'SELECT public.run_temporal_automation_cycle();',
  'the existing private temporal command remains unchanged'
);

SELECT * FROM finish();
ROLLBACK;
