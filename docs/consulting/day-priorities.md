# Prioridades da consultoria

Na **Visão do dia**, o painel **Prioridades da consultoria** apresenta três filtros:

- **Entregas atrasadas:** entrega não concluída (`status <> aprovado`), não excluída,
  com prazo anterior à data atual. Entregue e em validação continuam pendentes.
- **Acompanhamentos:** a data `return_on` dos planos mensais ativos até hoje + 7 dias,
  incluindo atrasados e hoje. É a data informada pela equipe, não uma detecção de
  mensagem enviada ou resposta recebida. Planos pausados/encerrados ficam de fora.
- **Prazos de projetos:** projetos com prazo até hoje + 7 dias, incluindo atrasados.

Todos os filtros excluem projetos finalizados, arquivados ou cancelados, projetos
com `archived_at` preenchido e clientes arquivados. Projetos/entregas sem data não
entram nos filtros de prazo. A data da consulta usa **America/Sao_Paulo**.

Os totais abrangem todos os itens elegíveis antes da paginação. A lista mostra seis
por página, ordenados pela data e pelo id, com **Abrir projeto** para a ficha correta.
O painel é da empresa; as prioridades pessoais de tarefas/atendimentos permanecem
abaixo. A lista completa de planos mensais fica recolhida para reduzir o volume
inicial de informações no celular.

A tela mantém filtros e controles enquanto carrega outra página, oculta os itens
da categoria anterior e diferencia carregamento/erro de ausência de prioridades.
Mudanças em projetos, entregas, clientes e planos invalidam a consulta; o botão
de atualização do Meu Dia também atualiza prioridades e planos. Ao retornar de
outra tela, a consulta é atualizada novamente. Não há cron, notificações ou envio.

## Ativação

Depende da ativação anterior de planos mensais. Aplicar uma vez
`docs/operations/consulting-day-priorities.sql` no banco operacional do projeto.
A cópia corresponde à migration `20261020215124_consulting_day_priorities.sql` e
pode ser reaplicada. Depois publicar no Lovable. Não altera registros nem adiciona
tabelas; cria a RPC de leitura `read_consulting_day(uuid,text,integer)`.

Essa função precisa ler os planos privados, por isso usa `SECURITY DEFINER` com
`search_path` vazio e checagem explícita de `auth.uid()` seguida do helper existente
de acesso a Consultoria: vínculo ativo com a empresa, papel interno e módulo de
projetos habilitado. Todos os vínculos entre projetos, clientes, entregas e planos
incluem a empresa. Apenas `authenticated` recebe EXECUTE; PUBLIC, anon e service_role
não recebem acesso. A resposta contém somente identificadores, cliente, referência,
títulos e datas necessários ao painel. Não inclui valores, documentos ou notas.

## Demonstração e validação

A demonstração usa o mesmo componente visual com dados locais e referência fixa
de 18/10/2026. Os exemplos possuem prazos de entregas; edições, conclusões, pausa do
plano e encerramento do projeto refletem nos totais. Reiniciar restaura os exemplos.
Nenhum acesso à RPC ocorre na demonstração.

`tests/consulting-day.database.mjs` executa o SQL real em Postgres/PGlite: repetição
da ativação, totais e três páginas, sete dias inclusivos, datas nulas, exclusões,
organizações divergentes, perfis internos/externos, vínculo inativo, módulo desativado,
segmento diferente e grants. Integra o workflow de validação Supabase.
`097_consulting_day.sql` valida assinatura, privilégios, search_path e ausência de sessão.
Testes de modelo e renderização verificam datas civis, transição de categoria, estados
vazios, três idiomas, texto escapado, conclusão/pausa e invalidadores do cache.
