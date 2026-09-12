BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public','commercial_proposals','commercial proposal register exists');
SELECT has_table('public','commercial_proposal_counters','tenant proposal counter exists');
SELECT has_column('public','financial_transactions','commercial_proposal_id','revenue tracks its proposal');
SELECT ok(
  has_table_privilege('authenticated','public.commercial_proposals','SELECT')
  AND NOT has_table_privilege('authenticated','public.commercial_proposals','INSERT')
  AND NOT has_table_privilege('anon','public.commercial_proposals','SELECT'),
  'internal rows are read-only to members and never exposed directly to public links'
);
SELECT ok(
  has_function_privilege('authenticated','public.save_commercial_proposal(uuid,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.save_commercial_proposal(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('anon','public.get_public_commercial_proposal(uuid)','EXECUTE')
  AND has_function_privilege('anon','public.respond_to_commercial_proposal(uuid,text,text,boolean,text)','EXECUTE'),
  'proposal management is private while token actions are public RPCs'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
('1a890000-0000-0000-0000-000000000001','proposal-owner@fluxa.test','{}','authenticated','authenticated','',now()),
('1a890000-0000-0000-0000-000000000002','proposal-outsider@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.profiles(id,full_name,email) VALUES
('1a890000-0000-0000-0000-000000000001','Responsável Propostas','proposal-owner@fluxa.test'),
('1a890000-0000-0000-0000-000000000002','Pessoa Externa','proposal-outsider@fluxa.test')
ON CONFLICT (id) DO UPDATE SET full_name=excluded.full_name;
INSERT INTO public.organizations(id,legal_name,trade_name,created_by) VALUES
('2a890000-0000-0000-0000-000000000001','Empresa Propostas Ltda','Empresa Propostas','1a890000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
('2a890000-0000-0000-0000-000000000001','1a890000-0000-0000-0000-000000000001','proprietario',true);
INSERT INTO public.commercial_opportunities(
  id,organization_id,title,stage,estimated_value,probability,owner_id,created_by,updated_by
) VALUES (
  '3a890000-0000-0000-0000-000000000001','2a890000-0000-0000-0000-000000000001',
  'Assessoria mensal','proposal',790,50,'1a890000-0000-0000-0000-000000000001',
  '1a890000-0000-0000-0000-000000000001','1a890000-0000-0000-0000-000000000001'
);
CREATE TEMP TABLE proposal_test_ids(id uuid, public_token uuid);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1a890000-0000-0000-0000-000000000002',true);
SELECT throws_ok(
  $$SELECT public.save_commercial_proposal(
    '2a890000-0000-0000-0000-000000000001',NULL,
    '{"title":"Sem acesso","service_description":"Serviço","terms":"Condições","customer_name":"Cliente","amount":100,"billing_frequency":"once","first_due_date":"2090-01-10","valid_until":"2090-01-05"}'::jsonb
  )$$,
  'NOT_ALLOWED','an outsider cannot create a proposal'
);

SELECT set_config('request.jwt.claim.sub','1a890000-0000-0000-0000-000000000001',true);
INSERT INTO proposal_test_ids(id)
SELECT public.save_commercial_proposal(
  '2a890000-0000-0000-0000-000000000001',NULL,
  jsonb_build_object(
    'opportunity_id','3a890000-0000-0000-0000-000000000001',
    'title','Assessoria mensal','service_description','Contabilidade e relatórios mensais',
    'terms','Início após o aceite','customer_name','Cliente da Proposta',
    'customer_email','cliente-proposta@fluxa.test','customer_phone','27999998888',
    'customer_document','111.444.777-35','amount',790,'billing_frequency','monthly',
    'first_due_date',(current_date+3)::text,'valid_until',(current_date+7)::text,
    'asaas_auto_charge',false
  )
);
UPDATE proposal_test_ids test SET public_token=proposal.public_token
FROM public.commercial_proposals proposal WHERE proposal.id=test.id;
SELECT is(
  (SELECT status FROM public.commercial_proposals WHERE id=(SELECT id FROM proposal_test_ids)),
  'draft','new proposals start as drafts'
);
SELECT lives_ok(
  format('SELECT public.publish_commercial_proposal(%L,%L,false)',
    '2a890000-0000-0000-0000-000000000001',(SELECT id FROM proposal_test_ids)),
  'an authorized member publishes the secure link'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT is(
  (SELECT status FROM public.get_public_commercial_proposal((SELECT public_token FROM proposal_test_ids))),
  'viewed','opening the link records its first view without exposing the table'
);
SELECT lives_ok(
  format('SELECT public.respond_to_commercial_proposal(%L,%L,%L,true,%L)',
    (SELECT public_token FROM proposal_test_ids),'accept','Cliente da Proposta','test-agent'),
  'the interested person can accept once through the token'
);
SELECT is(
  (public.respond_to_commercial_proposal(
    (SELECT public_token FROM proposal_test_ids),'accept','Cliente da Proposta',true,'test-agent'
  )->>'already_processed')::boolean,
  true,'repeating the acceptance is idempotent'
);

RESET ROLE;
SELECT is(
  (SELECT status FROM public.commercial_proposals WHERE id=(SELECT id FROM proposal_test_ids)),
  'accepted','the proposal is marked accepted'
);
SELECT is(
  (SELECT stage FROM public.commercial_opportunities WHERE id='3a890000-0000-0000-0000-000000000001'),
  'won','acceptance marks the linked opportunity as won'
);
SELECT is(
  (SELECT status::text FROM public.clients WHERE email='cliente-proposta@fluxa.test'
    AND organization_id='2a890000-0000-0000-0000-000000000001'),
  'ativo','acceptance creates an active customer'
);
SELECT is(
  (SELECT frequency FROM public.financial_recurrences
    WHERE id=(SELECT recurrence_id FROM public.commercial_proposals WHERE id=(SELECT id FROM proposal_test_ids))),
  'monthly','a recurring proposal creates the matching financial recurrence'
);
SELECT is(
  (SELECT status FROM public.financial_transactions
    WHERE commercial_proposal_id=(SELECT id FROM proposal_test_ids)),
  'pending','acceptance creates the first accounts-receivable entry once'
);
SELECT is(
  (SELECT count(*) FROM public.financial_transactions
    WHERE commercial_proposal_id=(SELECT id FROM proposal_test_ids)),
  1::bigint,'repeated acceptance never duplicates the first charge'
);
SELECT ok(
  (SELECT accepted_by_name='Cliente da Proposta' AND acceptance_user_agent_hash IS NOT NULL
    FROM public.commercial_proposals WHERE id=(SELECT id FROM proposal_test_ids)),
  'commercial acceptance keeps its auditable evidence'
);

SELECT * FROM finish();
ROLLBACK;
