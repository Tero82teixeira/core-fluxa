BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public',
  'create_portal_sla_notifications',
  ARRAY['timestamp with time zone'],
  'private portal SLA helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_portal_sla_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_portal_sla_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_portal_sla_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_portal_sla_notifications(timestamp with time zone)',
    'EXECUTE'
  ),
  'only postgres can invoke the portal SLA helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19500000-0000-0000-0000-000000000001', 'sla-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19500000-0000-0000-0000-000000000002', 'sla-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19500000-0000-0000-0000-000000000003', 'sla-client@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29500000-0000-0000-0000-000000000001',
  'Portal SLA Tenant',
  '19500000-0000-0000-0000-000000000001'
);
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  ('29500000-0000-0000-0000-000000000001', '19500000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29500000-0000-0000-0000-000000000001', '19500000-0000-0000-0000-000000000002', 'operacional', true);
INSERT INTO public.clients(id, organization_id, name, email, created_by)
VALUES (
  '39500000-0000-0000-0000-000000000001',
  '29500000-0000-0000-0000-000000000001',
  'Cliente SLA',
  'sla-client@fluxa.test',
  '19500000-0000-0000-0000-000000000001'
);

INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, channel, status, priority,
  assigned_to, created_by
) VALUES
  ('49500000-0000-0000-0000-000000000001', '29500000-0000-0000-0000-000000000001', '39500000-0000-0000-0000-000000000001', 'SLA preventivo', 'interno', 'aguardando_equipe', 'urgente', '19500000-0000-0000-0000-000000000002', '19500000-0000-0000-0000-000000000001'),
  ('49500000-0000-0000-0000-000000000002', '29500000-0000-0000-0000-000000000001', '39500000-0000-0000-0000-000000000001', 'SLA vencido sem responsável', 'interno', 'aguardando_equipe', 'urgente', NULL, '19500000-0000-0000-0000-000000000001'),
  ('49500000-0000-0000-0000-000000000003', '29500000-0000-0000-0000-000000000001', '39500000-0000-0000-0000-000000000001', 'Empresa já respondeu', 'interno', 'aguardando_equipe', 'urgente', '19500000-0000-0000-0000-000000000002', '19500000-0000-0000-0000-000000000001'),
  ('49500000-0000-0000-0000-000000000004', '29500000-0000-0000-0000-000000000001', '39500000-0000-0000-0000-000000000001', 'Conversa não compartilhada', 'interno', 'aguardando_equipe', 'urgente', '19500000-0000-0000-0000-000000000002', '19500000-0000-0000-0000-000000000001');

INSERT INTO public.client_portal_communication_shares(
  organization_id, client_id, thread_id, is_shared, opened_by_client, shared_at
) VALUES
  ('29500000-0000-0000-0000-000000000001', '39500000-0000-0000-0000-000000000001', '49500000-0000-0000-0000-000000000001', true, true, '2030-01-01 10:20:00+00'),
  ('29500000-0000-0000-0000-000000000001', '39500000-0000-0000-0000-000000000001', '49500000-0000-0000-0000-000000000002', true, true, '2030-01-01 09:00:00+00'),
  ('29500000-0000-0000-0000-000000000001', '39500000-0000-0000-0000-000000000001', '49500000-0000-0000-0000-000000000003', true, true, '2030-01-01 09:00:00+00'),
  ('29500000-0000-0000-0000-000000000001', '39500000-0000-0000-0000-000000000001', '49500000-0000-0000-0000-000000000004', false, true, '2030-01-01 09:00:00+00');

INSERT INTO public.communication_entries(
  organization_id, thread_id, entry_type, content, created_by, occurred_at,
  is_internal, metadata
) VALUES
  ('29500000-0000-0000-0000-000000000001', '49500000-0000-0000-0000-000000000001', 'mensagem', 'Preciso de ajuda', '19500000-0000-0000-0000-000000000003', '2030-01-01 10:20:00+00', false, '{"source":"client_portal"}'::jsonb),
  ('29500000-0000-0000-0000-000000000001', '49500000-0000-0000-0000-000000000002', 'mensagem', 'Meu prazo venceu', '19500000-0000-0000-0000-000000000003', '2030-01-01 09:00:00+00', false, '{"source":"client_portal"}'::jsonb),
  ('29500000-0000-0000-0000-000000000001', '49500000-0000-0000-0000-000000000003', 'mensagem', 'Mensagem antiga do cliente', '19500000-0000-0000-0000-000000000003', '2030-01-01 09:00:00+00', false, '{"source":"client_portal"}'::jsonb),
  ('29500000-0000-0000-0000-000000000001', '49500000-0000-0000-0000-000000000003', 'mensagem', 'Resposta pública da empresa', '19500000-0000-0000-0000-000000000001', '2030-01-01 10:00:00+00', false, '{"source":"staff_quick_chat"}'::jsonb),
  ('29500000-0000-0000-0000-000000000001', '49500000-0000-0000-0000-000000000004', 'mensagem', 'Mensagem privada', '19500000-0000-0000-0000-000000000003', '2030-01-01 09:00:00+00', false, '{"source":"client_portal"}'::jsonb);

SELECT public.create_portal_sla_notifications('2030-01-01 12:00:00+00');
SELECT is(
  (SELECT count(*) FROM public.notifications
    WHERE entity_id = '49500000-0000-0000-0000-000000000001'
      AND dedupe_key LIKE 'portal-sla:%'),
  1::bigint,
  'preventive warning goes only to the active responsible member'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
    WHERE entity_id = '49500000-0000-0000-0000-000000000002'
      AND user_id = '19500000-0000-0000-0000-000000000001'
      AND dedupe_key LIKE 'portal-sla:%'),
  1::bigint,
  'unassigned overdue conversation is sent to active management'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
    WHERE entity_id = '49500000-0000-0000-0000-000000000003'
      AND dedupe_key LIKE 'portal-sla:%'),
  0::bigint,
  'latest company reply prevents a false SLA alert'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
    WHERE entity_id = '49500000-0000-0000-0000-000000000004'
      AND dedupe_key LIKE 'portal-sla:%'),
  0::bigint,
  'unshared conversations never create portal SLA notifications'
);

SELECT public.create_portal_sla_notifications('2030-01-01 12:00:00+00');
SELECT is(
  (SELECT count(*) FROM public.notifications
    WHERE entity_id IN (
      '49500000-0000-0000-0000-000000000001',
      '49500000-0000-0000-0000-000000000002'
    ) AND dedupe_key LIKE 'portal-sla:%'),
  2::bigint,
  'repeating the same cycle does not duplicate notifications'
);

SELECT public.create_portal_sla_notifications('2030-01-01 12:30:00+00');
SELECT is(
  (SELECT count(*) FROM public.notifications
    WHERE entity_id = '49500000-0000-0000-0000-000000000001'
      AND dedupe_key LIKE 'portal-sla:%'),
  3::bigint,
  'overdue stage reaches the responsible member and active management once'
);

UPDATE public.communication_threads
SET status = 'aguardando_cliente'
WHERE id = '49500000-0000-0000-0000-000000000001';
SELECT public.create_portal_sla_notifications('2030-01-02 12:30:00+00');
SELECT is(
  (SELECT count(*) FROM public.notifications
    WHERE entity_id = '49500000-0000-0000-0000-000000000001'
      AND dedupe_key LIKE 'portal-sla:%'),
  3::bigint,
  'leaving waiting-team status stops further SLA alerts'
);

SELECT * FROM finish();
ROLLBACK;
