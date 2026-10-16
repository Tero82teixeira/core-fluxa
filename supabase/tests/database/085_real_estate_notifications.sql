BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();
SELECT has_function('fluxa_real_estate_private','create_operational_notifications',ARRAY['timestamp with time zone'],'scanner imobiliário privado existe');
SELECT has_function('fluxa_real_estate_private','run_temporal_with_real_estate',ARRAY[]::text[],'integração privada com o relógio existe');
SELECT ok(NOT has_function_privilege('anon','fluxa_real_estate_private.create_operational_notifications(timestamptz)','EXECUTE')
  AND NOT has_function_privilege('authenticated','fluxa_real_estate_private.create_operational_notifications(timestamptz)','EXECUTE')
  AND NOT has_function_privilege('service_role','fluxa_real_estate_private.run_temporal_with_real_estate()','EXECUTE'),
  'API pública e service_role não executam o scanner nem o relógio');
SELECT is((SELECT count(*) FROM cron.job WHERE jobname='core-fluxa-process-due-scheduled-automations'),1::bigint,'preserva um único relógio');
SELECT is((SELECT command FROM cron.job WHERE jobname='core-fluxa-process-due-scheduled-automations'),
  'SELECT fluxa_real_estate_private.run_temporal_with_real_estate();','job chama a integração imobiliária');
SELECT is((SELECT schedule FROM cron.job WHERE jobname='core-fluxa-process-due-scheduled-automations'),'*/15 * * * *','mantém frequência de 15 minutos');
SELECT ok((SELECT bool_and(NOT p.prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='fluxa_real_estate_private' AND p.proname IN ('create_operational_notifications','run_temporal_with_real_estate')),
  'não há elevação de privilégios nas novas funções');
SELECT ok(position('create_asaas_client_payment_notifications' IN pg_get_functiondef('public.run_temporal_automation_cycle()'::regprocedure))>0
  AND position('create_health_operational_notifications' IN pg_get_functiondef('public.run_temporal_automation_cycle()'::regprocedure))>0
  AND position('create_legal_operational_notifications' IN pg_get_functiondef('public.run_temporal_automation_cycle()'::regprocedure))>0,
  'migrations posteriores mantêm Saúde, Jurídico e Asaas no ciclo delegado');
-- A base migrada sem os módulos opcionais também deve executar sem erro.
SELECT is(fluxa_real_estate_private.create_operational_notifications(),0,'sem tabelas imobiliárias retorna zero');
SELECT * FROM finish();
ROLLBACK;
