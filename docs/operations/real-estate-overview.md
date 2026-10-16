# Visão geral da imobiliária

O painel reúne propostas abertas ou em contraproposta, contratos ativos vencidos ou com término em até 30 dias e demonstrativos recebidos cujo repasse está atrasado. A busca consulta também registros concluídos quando selecionado “Todos os registros”. Os totais dos cartões sempre consideram a empresa inteira; a lista usa os filtros e páginas de 20 registros.

## Instalação

1. No SQL Editor do banco operacional já usado pelo FLUXA, execute o conteúdo completo de `docs/operations/real-estate-overview.sql` uma vez. As etapas imobiliárias foundation, activity, proposals, contracts e settlements devem estar instaladas nesse mesmo banco.
2. Publique a atualização no Lovable.

O script cria apenas uma consulta de leitura, preserva RLS e não altera dados de clientes. Pode ser executado novamente. A mesma definição está versionada em `supabase/migrations/20261016173751_real_estate_overview.sql` para ambientes que aplicam migrations automaticamente; nesses ambientes não é necessário executar o script manualmente.

## Verificação automatizada

`npm run check` verifica tipos, lint, testes e build. O workflow de validação Supabase também executa `tests/real-estate-overview.database.mjs` em um banco local descartável com dados fictícios. A cobertura inclui busca literal, estado atual dos registros, contagens independentes dos filtros, paginação e isolamento por empresa e perfil.

## Reversão

Reverta primeiro a atualização da interface. Depois, se necessário, remova apenas a função com `DROP FUNCTION IF EXISTS public.real_estate_overview(uuid,text,text,text,integer);`. Nenhuma tabela ou dado precisa ser removido.
