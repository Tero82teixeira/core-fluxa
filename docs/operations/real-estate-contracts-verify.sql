-- Somente leitura. Esperado: RLS=true, duas policies por tabela, demais flags false.
SELECT c.relname AS tabela,c.relrowsecurity AS rls,
 (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS politicas,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_pode_ler,
 has_table_privilege('anon',c.oid,'INSERT') AS anon_pode_gravar,
 has_table_privilege('authenticated',c.oid,'UPDATE') AS usuario_pode_reescrever,
 has_table_privilege('authenticated',c.oid,'DELETE') AS usuario_pode_excluir
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('real_estate_contracts','real_estate_contract_events') ORDER BY c.relname;
SELECT p.proname,p.prosecdef AS security_definer,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_pode_executar
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
AND p.proname IN ('record_real_estate_contract','list_real_estate_contracts','real_estate_contract_history','real_estate_contract_options') ORDER BY p.proname;
