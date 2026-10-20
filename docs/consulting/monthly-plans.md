# Planos de atendimento mensal

Cada projeto de Consultoria e Serviços pode ter um plano mensal. Na ficha do
projeto, a equipe define serviço, valor mensal, início/término, situação, próximo
retorno previsto e um modelo de 1 a 20 atividades (título e dia do mês).
O valor é informativo: não altera o valor global do projeto, não gera receitas,
recorrências financeiras, cobranças Asaas, contratos ou mensagens.

## Operação

1. Em Projetos e entregas, abra a ficha do projeto e crie o plano mensal.
2. Escolha a competência e use Gerar tarefas do mês.
3. As tarefas ficam no projeto e na área Tarefas. O responsável por nome vem do
   projeto; não se atribui automaticamente uma conta de usuário. A equipe pode
   ajustar a atribuição na área Tarefas. A recorrência nativa da tarefa é `none`.
4. A geração é explícita, uma vez por competência. Um bloqueio da linha do projeto
   e do plano serializa gravação e geração; a chave única projeto/competência
   impede repetir o lote. O histórico persiste mesmo se tarefas forem removidas.
5. Alterar o modelo só afeta meses ainda não gerados. Pausar/encerrar o plano
   bloqueia novas gerações, sem cancelar tarefas existentes. Para renovar, revise
   o período e a situação. Projetos concluídos/arquivados ou clientes arquivados
   não podem gerar rotina.

Dias 29–31 são limitados ao último dia do mês. No primeiro/último mês parcial,
as datas são limitadas ao início/término do plano. As tarefas vencem às 12h de
Brasília; leituras da rotina preservam a data civil nessa zona. Nenhum relógio
ou cron foi adicionado. Concluir uma tarefa não cria a próxima competência.

A Visão do dia mostra planos paginados de 10 em 10, total completo e avisos:
períodos que terminam em até 30 dias, períodos encerrados e retorno previsto
para hoje ou atrasado. São avisos no painel, sem notificação externa. A data de
retorno é informada pela equipe e não representa leitura/resposta de mensagem.

## Acesso e ativação

As duas tabelas têm RLS e nenhum acesso direto para anon, authenticated ou
service_role. Três RPCs autenticados verificam membro ativo, papel, organização,
área de consultoria, módulo de projetos e vínculo com cliente/projeto. Leitura:
proprietário, administrador, gestor, operacional, visualizador e superadmin.
Escrita: os mesmos, exceto visualizador. Geração exige também o módulo Tarefas.
O helper de acesso é interno, sem EXECUTE para esses papéis.

Salvar usa revisão otimista; uma edição antiga é rejeitada, sem sobrescrever a
nova. Salvamento, auditoria e geração são transações no banco. Falha em uma
inserção de tarefa reverte todo o lote e permite tentar novamente.

Aplicar `docs/operations/consulting-monthly-plans.sql` no operacional
`nobtbymxudlcsyurbopl` antes de publicar pelo Lovable. Não aplicar nos projetos
auxiliares. A migração oficial é `20261019161140_consulting_monthly_plans.sql`.
Em caso de reversão de UI, conservar as tabelas e o histórico; não apagar tarefas.

## Demonstração e validação

`/demo?area=consulting_services` inclui Planos mensais, ficha editável e geração
local por competência. Tudo fictício, referência 18/10/2026, com reinício e PT/EN/ES.
Tarefas de exemplo concluídas na aba Tarefas atualizam a leitura da rotina.

PGlite executa o SQL real com cenários de calendário, repetição, mudança de modelo,
pausa, revisão antiga, atomicidade, paginação, papéis e isolamento. pgTAP verifica
RLS e grants no schema completo. A CI compara os tipos gerados com os tipos
versionados e executa tipos, lint, testes e build.
