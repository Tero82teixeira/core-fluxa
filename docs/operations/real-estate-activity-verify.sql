-- Somente leitura. Esperado: duas linhas, rls=true, politicas=3, nenhum acesso anon,
-- sem exclusão por authenticated, gravação respeita RLS=true.
SELECT c.relname AS tabela,c.relrowsecurity AS rls,
 (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS politicas,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_pode_ler,
 has_table_privilege('authenticated',c.oid,'DELETE') AS usuario_pode_excluir,
 NOT f.prosecdef AS gravacao_respeita_rls,
 has_function_privilege('anon',f.oid,'EXECUTE') AS anon_pode_gravar
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc f ON f.oid=CASE WHEN c.relname='real_estate_interests'
 THEN 'public.save_real_estate_interest(uuid,uuid,bigint,jsonb)'::regprocedure
 ELSE 'public.save_real_estate_visit(uuid,uuid,bigint,jsonb)'::regprocedure END
WHERE n.nspname='public' AND c.relname IN ('real_estate_interests','real_estate_visits') ORDER BY c.relname;
