-- Somente leitura. Executar depois do script de criação, no mesmo banco.
SELECT
  to_regclass('public.real_estate_properties') AS tabela_imoveis,
  (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.real_estate_properties')) AS rls_ativado,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='real_estate_properties') AS politicas,
  (SELECT NOT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.save_real_estate_property(uuid,uuid,bigint,jsonb)')) AS salvamento_respeita_rls,
  has_function_privilege('anon','public.save_real_estate_property(uuid,uuid,bigint,jsonb)','EXECUTE') AS anon_pode_salvar,
  has_table_privilege('anon','public.real_estate_properties','SELECT') AS anon_pode_ler,
  has_table_privilege('authenticated','public.real_estate_properties','DELETE') AS usuario_pode_excluir;
-- Esperado: real_estate_properties | true | 3 | true | false | false | false.
