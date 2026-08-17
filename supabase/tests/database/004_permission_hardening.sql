BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(11);

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at)
VALUES
  ('12000000-0000-0000-0000-000000000001', 'owner-permissions@fluxa.test', '{"full_name":"Owner Test"}', 'authenticated', 'authenticated', '', now()),
  ('12000000-0000-0000-0000-000000000002', 'manager-permissions@fluxa.test', '{"full_name":"Manager Test"}', 'authenticated', 'authenticated', '', now()),
  ('12000000-0000-0000-0000-000000000003', 'operator-permissions@fluxa.test', '{"full_name":"Operator Test"}', 'authenticated', 'authenticated', '', now()),
  ('12000000-0000-0000-0000-000000000004', 'viewer-permissions@fluxa.test', '{"full_name":"Viewer Test"}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations (id, legal_name, trade_name)
VALUES
  ('22000000-0000-0000-0000-000000000001', 'Permission Organization A Ltda', 'Permission Org A'),
  ('22000000-0000-0000-0000-000000000002', 'Permission Organization B Ltda', 'Permission Org B');

INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
VALUES
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'proprietario', true),
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002', 'gestor', true),
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000003', 'operacional', true),
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000004', 'visualizador', true);

INSERT INTO public.financial_transactions (
  id, organization_id, type, description, amount, status, due_date, created_by
) VALUES (
  '32000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'income', 'Lançamento protegido', 250, 'pending', current_date + 5,
  '12000000-0000-0000-0000-000000000001'
);

INSERT INTO public.documents (
  id, organization_id, title, status, file_path, original_file_name, stored_file_name,
  file_extension, mime_type, file_size, current_version, uploaded_by, uploaded_by_name
) VALUES
  (
    '42000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'Documento protegido', 'recebido',
    '22000000-0000-0000-0000-000000000001/geral/doc-v1.pdf',
    'doc-v1.pdf', 'doc-v1.pdf', 'pdf', 'application/pdf', 10, 1,
    '12000000-0000-0000-0000-000000000001', 'Owner Test'
  ),
  (
    '42000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'Documento de outra organização', 'recebido',
    '22000000-0000-0000-0000-000000000002/geral/doc-b.pdf',
    'doc-b.pdf', 'doc-b.pdf', 'pdf', 'application/pdf', 10, 1,
    '12000000-0000-0000-0000-000000000001', 'Owner Test'
  );

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000003', true);
SELECT is(
  (SELECT count(*) FROM public.financial_transactions WHERE organization_id='22000000-0000-0000-0000-000000000001'),
  0::bigint,
  'operacional não lê valores financeiros'
);

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000004', true);
SELECT is(
  (SELECT count(*) FROM public.financial_transactions WHERE organization_id='22000000-0000-0000-0000-000000000001'),
  0::bigint,
  'visualizador não lê valores financeiros'
);

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*) FROM public.financial_transactions WHERE organization_id='22000000-0000-0000-0000-000000000001'),
  1::bigint,
  'gestor lê financeiro da própria organização'
);

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
SELECT is(
  (SELECT count(*) FROM public.financial_transactions WHERE organization_id='22000000-0000-0000-0000-000000000001'),
  1::bigint,
  'proprietário lê financeiro da própria organização'
);

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000003', true);
SELECT throws_ok(
  $$UPDATE public.documents SET status='aprovado' WHERE id='42000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'DOCUMENT_SENSITIVE_UPDATE_DENIED',
  'operacional não aprova documento por chamada direta'
);

SELECT throws_ok(
  $$UPDATE public.documents SET archived_at=now(), status='arquivado' WHERE id='42000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'DOCUMENT_SENSITIVE_UPDATE_DENIED',
  'operacional não arquiva documento por chamada direta'
);

SELECT throws_ok(
  $$INSERT INTO public.documents (
      id, organization_id, title, status, file_path, original_file_name, stored_file_name,
      file_extension, mime_type, file_size, current_version
    ) VALUES (
      '42000000-0000-0000-0000-000000000003',
      '22000000-0000-0000-0000-000000000001',
      'Aprovação forjada', 'aprovado',
      '22000000-0000-0000-0000-000000000001/geral/forjado.pdf',
      'forjado.pdf', 'forjado.pdf', 'pdf', 'application/pdf', 10, 1
    )$$,
  'P0001',
  'DOCUMENT_SENSITIVE_UPDATE_DENIED',
  'operacional não cria documento já aprovado'
);

UPDATE public.documents
SET current_version=2,
    file_path='22000000-0000-0000-0000-000000000001/geral/doc-v2.pdf',
    original_file_name='doc-v2.pdf',
    stored_file_name='doc-v2.pdf',
    status='em_analise',
    uploaded_by='12000000-0000-0000-0000-000000000004',
    uploaded_by_name='Autor forjado'
WHERE id='42000000-0000-0000-0000-000000000001';

SELECT ok(
  (SELECT status='em_analise'
          AND uploaded_by='12000000-0000-0000-0000-000000000003'
          AND uploaded_by_name='Operator Test'
          AND reviewed_by IS NULL
   FROM public.documents WHERE id='42000000-0000-0000-0000-000000000001'),
  'nova versão operacional volta para análise e autoria é normalizada'
);

INSERT INTO public.document_versions (
  organization_id, document_id, version_number, file_path, original_file_name,
  stored_file_name, mime_type, file_size, uploaded_by, uploaded_by_name
) VALUES (
  '22000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  2,
  '22000000-0000-0000-0000-000000000001/geral/doc-v2.pdf',
  'doc-v2.pdf', 'doc-v2.pdf', 'application/pdf', 10,
  '12000000-0000-0000-0000-000000000004', 'Autor forjado'
);

SELECT ok(
  (SELECT uploaded_by='12000000-0000-0000-0000-000000000003'
          AND uploaded_by_name='Operator Test'
   FROM public.document_versions
   WHERE document_id='42000000-0000-0000-0000-000000000001' AND version_number=2),
  'versão registra o usuário autenticado, não autoria enviada pelo cliente'
);

SELECT throws_ok(
  $$INSERT INTO public.document_versions (
      organization_id, document_id, version_number, file_path, original_file_name,
      stored_file_name, mime_type, file_size
    ) VALUES (
      '22000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000002',
      3,
      '22000000-0000-0000-0000-000000000001/geral/cross-org.pdf',
      'cross-org.pdf', 'cross-org.pdf', 'application/pdf', 10
    )$$,
  'P0001',
  'DOCUMENT_VERSION_ORG_MISMATCH',
  'versão não pode apontar para documento de outra organização'
);

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
UPDATE public.documents
SET status='aprovado',
    reviewed_by='12000000-0000-0000-0000-000000000004',
    reviewed_by_name='Revisor forjado',
    reviewed_at='2000-01-01'::timestamptz
WHERE id='42000000-0000-0000-0000-000000000001';

SELECT ok(
  (SELECT status='aprovado'
          AND reviewed_by='12000000-0000-0000-0000-000000000001'
          AND reviewed_by_name='Owner Test'
          AND reviewed_at > now() - interval '1 minute'
   FROM public.documents WHERE id='42000000-0000-0000-0000-000000000001'),
  'aprovação privilegiada registra revisor autenticado no banco'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
