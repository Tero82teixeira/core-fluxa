# Painel e agenda jurídicos: ativação

1. No SQL Editor do projeto operacional `nobtbymxudlcsyurbopl`, executar `legal-workspace-reliability.sql` inteiro. Ele exige as migrations jurídicas anteriores (módulo, fichas e prazos) e não modifica registros existentes.
2. Publicar a atualização no Lovable com Publish → Update.

A migration foi criada pela CLI e posicionada depois de `20261023120000_focused_health_workspace.sql` para respeitar a ordem das dependências jurídicas já versionadas com datas futuras.

A nova RPC `read_legal_workspace` calcula os indicadores sobre toda a carteira, com prévias explícitas de oito prazos e seis tarefas. Prazos gerais e individuais abertos são contados como compromissos distintos; processos encerrados e registros arquivados não entram nos indicadores. O painel usa o dia de Brasília. Não calcula vencimentos a partir de regras de contagem de dias úteis.

A agenda consulta diretamente o período selecionado, com 20 compromissos por página e totais completos. Audiências e tarefas usam o fuso do aparelho; prazos mantêm sua data civil, sem conversão de fuso. Alterar período reinicia a página. Gravações de audiência, prazo, processo e tarefa invalidam as consultas correspondentes; há atualização periódica de 60 segundos.

Mantém os papéis das RPCs jurídicas anteriores, organização ativa e módulo jurídico habilitado. A função de leitura usa SECURITY DEFINER porque as tabelas jurídicas são privadas, sem SELECT direto para authenticated. Não concede acesso às tabelas nem altera políticas ou assinaturas das funções existentes. O portal externo não recebe permissão para esta RPC.

Se a RPC ainda não tiver sido aplicada, painel e agenda mostram erro com opção de tentar novamente; não apresentam totais parciais como se fossem completos. A demonstração pública mantém seus dados fictícios e não consulta esta RPC.

Validação: `tests/legal-workspace.database.mjs` executa a SQL real com PGlite e verifica carteira maior que 500 processos, 505 compromissos paginados sem omissões, limites de período, gravações existentes, status e isolamento de acesso. O workflow de validação também aplica a migration no Supabase local e verifica paridade dos tipos.

Reversão: retornar o frontend para a versão anterior por um novo commit. A RPC é somente leitura e pode permanecer instalada; não remover as tabelas jurídicas ou seus dados.
