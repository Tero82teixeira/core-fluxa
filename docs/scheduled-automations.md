# Fundação de automações temporais

Esta etapa adiciona somente a fundação de banco para regras com
`trigger_type = 'scheduled'`. A configuração fica em `automation_schedules`,
separada das regras orientadas a eventos, e guarda tipo, intervalo ou horário,
timezone, estado e os instantes da última e da próxima execução.

## Disparo operacional

O job `core-fluxa-process-due-scheduled-automations` executa a cada 15 minutos,
como papel `postgres`, no próprio banco operacional:

```sql
select public.run_temporal_automation_cycle();
```

O ciclo não recebe `organization_id`: primeiro processa as regras vencidas e
depois procura alertas operacionais críticos. O tenant sempre é obtido das
próprias linhas do banco. As funções não estão expostas a `PUBLIC`, `anon`,
`authenticated` ou `service_role`. A migration remove qualquer job anterior com
o mesmo nome antes de recriá-lo, de modo que reaplicações não acumulam jobs.

O estado, a última execução e o histórico ficam disponíveis em **Cloud → Jobs**
no Lovable. O intervalo de 15 minutos limita o uso do Cloud a no máximo 96
chamadas curtas por dia, com atraso operacional máximo de 15 minutos. O job pode
ser desabilitado nessa tela se houver aumento inesperado de uso ou falhas.

## Gerenciamento autenticado

Criação e alteração de uma regra temporal sempre passam pelos RPCs dedicados
`create_scheduled_automation` e `update_scheduled_automation`. As operações
gravam regra e agenda na mesma transação, derivam o tenant da regra nas
alterações e validam permissão administrativa, formato, timezone e primeira
execução futura. Ativação e arquivamento também têm RPCs dedicados para manter
os dois registros sincronizados.

Os RPCs genéricos de automação rejeitam `trigger_type = 'scheduled'`. Isso evita
regras sem agenda e impede que uma operação parcial quebre a relação entre as
tabelas. O frontend dispõe dos contratos e hooks desses RPCs, mas a interface de
criação por horário usa somente os RPCs dedicados.

## Concorrência e idempotência

Cada lote usa `FOR UPDATE SKIP LOCKED`. Além disso, cada par agenda/ciclo possui
índice único em `automation_executions`; portanto, chamadas repetidas ou
concorrentes não repetem o mesmo ciclo. Falhas são registradas individualmente e
não interrompem as demais agendas.

## Alertas críticos imediatos

A cada ciclo, pendências com prioridade efetiva `critica` geram uma notificação
interna para o responsável ativo. Quando não há responsável, proprietários e
administradores ativos recebem o aviso. Alertas resolvidos ou ignorados, fontes
ocultas nas configurações e organizações com **Alertas críticos** desativado são
ignorados.

A chave de deduplicação permite apenas um aviso por destinatário e episódio. Uma
reexecução do relógio não repete o alerta; se a pendência for resolvida e depois
reaberta, o novo episódio pode avisar novamente. Uma falha nessa varredura é
isolada e não desfaz tarefas ou resumos já processados pelo mesmo ciclo.

## Pendências sem responsável

Alertas operacionais sem responsável ativo geram uma notificação interna para
proprietários e administradores ativos. O sistema não atribui uma pessoa por
conta própria: o aviso direciona o administrador ao Monitoramento para uma
decisão humana. A preferência **Pendências sem responsável** permite desativar
essa categoria nas Configurações.

O mesmo item não é repetido a cada ciclo. Uma nova notificação só é permitida
quando há evidência de um novo episódio, como a remoção explícita do responsável
ou a alteração do prazo operacional que identifica a pendência.

## Lembretes antecipados de prazo

Tarefas, processos, documentos e contas em aberto geram notificações internas
quando faltam 30, 15, 7 ou 1 dia para o prazo. O cálculo usa a data civil no fuso
horário configurado pela organização. Itens concluídos, cancelados ou arquivados
não geram lembretes.

O responsável ativo recebe o aviso. Sem um destinatário válido, proprietários e
administradores ativos recebem o lembrete; dados financeiros só são enviados a
papéis autorizados a visualizá-los. A chave combina item, vencimento e degrau do
prazo, impedindo repetição no mesmo dia e permitindo uma nova sequência quando a
data for realmente alterada. A categoria pode ser desativada em Configurações.

## Escalonamento de tarefas atrasadas

Tarefas abertas com responsável ativo geram avisos internos em três degraus: no
primeiro dia de atraso, o responsável é avisado; no terceiro dia, responsável,
proprietários e administradores são avisados; no sétimo dia, o aviso é enviado
somente a proprietários e administradores. Tarefas sem responsável continuam no
fluxo específico de **Pendências sem responsável**, evitando sobreposição.

Tarefas concluídas, canceladas, arquivadas ou excluídas são ignoradas. A chave de
deduplicação combina tarefa, data do prazo, degrau e destinatário, garantindo um
único aviso por pessoa em cada etapa e permitindo uma nova sequência apenas
quando o prazo for alterado. A categoria respeita a preferência já existente
**Tarefas atrasadas** e reutiliza o mesmo relógio privado de 15 minutos.

## Avisos de processos sem movimentação

Processos abertos com responsável ativo geram um aviso interno ao atingir o
período sem movimentação configurado pela organização, que é de 14 dias por
padrão. Se o processo continuar parado por mais sete dias, o responsável,
proprietários e administradores ativos recebem o escalonamento. Uma atribuição
ativa feita no Monitoramento tem preferência sobre o responsável cadastrado no
processo.

Processos finalizados, cancelados, arquivados, resolvidos ou ignorados no
Monitoramento não geram avisos. Itens sem responsável continuam no fluxo
específico de **Pendências sem responsável**. Quando um alerta crítico já está
ativo, esta categoria não cria outro aviso; se a preferência de alertas críticos
estiver desativada, o aviso de inatividade continua disponível para evitar uma
lacuna de acompanhamento.

A chave de deduplicação combina processo, instante da última movimentação,
configuração de prazo, nível do aviso e destinatário. Assim, cada pessoa recebe
um único aviso por etapa do episódio, enquanto uma movimentação real permite um
novo ciclo futuro. A automação apenas notifica: não cria tarefas, não muda a
etapa do processo e não envia WhatsApp ou e-mail. Ela respeita a preferência
**Processos sem movimentação** e reutiliza o relógio privado de 15 minutos.

## Escalonamento de retornos de comunicação

Comunicações abertas com retorno agendado e responsável ativo geram um aviso
interno no primeiro dia civil de atraso. No terceiro dia, o responsável,
proprietários e administradores ativos recebem o escalonamento. Uma atribuição
ativa feita no Monitoramento tem preferência sobre o responsável cadastrado na
comunicação.

Comunicações resolvidas ou arquivadas, itens resolvidos ou ignorados no
Monitoramento, fontes de comunicação ocultas e organizações com **Retornos
vencidos** desativado não geram esses avisos. Itens sem responsável continuam
no fluxo específico de **Pendências sem responsável**. Quando um alerta crítico
já está ativo, esta categoria não cria outro aviso; com alertas críticos
desativados, o aviso de retorno atrasado continua disponível.

A chave de deduplicação combina comunicação, data e horário do retorno, nível do
aviso e destinatário. Repetições do relógio não duplicam o aviso, enquanto uma
reprogramação real inicia um novo episódio. A automação não cria tarefas, não
muda o status da comunicação e não envia WhatsApp ou e-mail. Ela reutiliza o
relógio privado de 15 minutos.

## Avisos de documentos vencidos

Os lembretes antecipados já avisam documentos que vencerão em 30, 15, 7 e 1
dia. Depois do vencimento, esta categoria complementa o fluxo em três níveis:
entre 1 e 6 dias, o responsável ativo definido no Monitoramento é avisado; sem
responsável, proprietários e administradores recebem o aviso. Entre 7 e 29
dias, responsável e gestão recebem o escalonamento. Com 30 dias ou mais, um
novo nível informa que a pendência continua sem regularização.

Documentos arquivados, fontes ocultas, acompanhamentos resolvidos ou ignorados
e organizações com **Documentos vencendo** desativado são ignorados. Quando um
alerta crítico já cobre o documento, esta categoria não cria uma notificação
concorrente; se os alertas críticos estiverem desativados, o aviso específico
continua disponível para não deixar uma lacuna operacional.

A chave de deduplicação combina documento, data de validade, nível do aviso e
destinatário. Alterar legitimamente a validade inicia um novo episódio, sem
repetições a cada ciclo. A automação apenas notifica: não muda o status do
documento, não cria tarefa e não envia mensagens externas. O relógio privado de
15 minutos permanece único.

## Avisos de contas vencidas

Os lembretes antecipados já avisam contas a receber e a pagar quando faltam 30,
15, 7 ou 1 dia. Depois do vencimento, contas ainda abertas e com saldo recebem
um aviso específico: de 1 a 6 dias, o responsável financeiro autorizado é
avisado; de 7 a 29 dias, responsável, proprietários e administradores recebem o
escalonamento; com 30 dias ou mais, a gestão recebe o alerta prolongado. Valores
pagos parcialmente exibem somente o saldo ainda sem baixa.

Contas pagas, canceladas, arquivadas, sem saldo, resolvidas ou ignoradas no
Monitoramento não geram avisos. A preferência **Contas vencidas** e a exibição
de alertas financeiros podem desativar a categoria. Quando um alerta crítico já
cobre a conta, esta varredura não cria uma notificação concorrente; com alertas
críticos desativados, o aviso financeiro específico continua disponível.

A chave de deduplicação combina lançamento, vencimento, nível e destinatário.
Alterar legitimamente o vencimento inicia um novo episódio, sem repetição a cada
ciclo. A automação não baixa valores, não altera o status financeiro, não cria
tarefas e não envia mensagens externas. Ela reutiliza o único relógio privado de
15 minutos.

## Geração automática de lançamentos recorrentes

Recorrências financeiras ativas e já configuradas pelo usuário geram seus
lançamentos automaticamente quando a data de próxima execução chega. A geração
respeita o fuso horário da organização, ignora empresas arquivadas e não processa
recorrências pausadas, finalizadas, arquivadas ou futuras. O botão manual
**Gerar pendentes agora** permanece disponível como contingência administrativa.

Cada lançamento recebe a recorrência e a data de origem. A restrição única já
existente nesses dois campos e o bloqueio concorrente com `SKIP LOCKED` impedem
duplicidades mesmo se o relógio e o botão manual forem usados ao mesmo tempo. O
processamento recupera datas pendentes em lotes limitados a 120 ocorrências por
recorrência e ciclo, evitando uma execução sem limite após longos períodos de
inatividade. O próximo ciclo continua de onde o anterior parou.

O lançamento nasce pendente e não movimenta saldo, não registra pagamento e não
envia comunicação externa. A execução automática grava auditoria como
**Automação**, preserva o criador original no lançamento e reutiliza o único
relógio privado de 15 minutos. A função interna não pode ser executada por
`PUBLIC`, `anon`, `authenticated` ou `service_role`; somente `postgres` a chama.

A interface permite programações diárias ou por intervalo de dias para criar
tarefas, notificações internas, registros de auditoria ou resumos das pendências
já identificadas pela Central de Monitoramento. O resumo respeita as preferências
da organização, agrupa itens por responsável e encaminha itens sem responsável
a proprietários e administradores ativos.

## Resumo financeiro semanal

Toda segunda-feira, depois das 08:00 no fuso horário da organização, o relógio
cria uma notificação interna consolidada para proprietários, administradores e
gestores ativos. O resumo apresenta valores em aberto a receber e a pagar,
quantidade e valor das contas vencidas, recebimentos e pagamentos da semana
anterior, compromissos dos próximos sete dias e o saldo atual das contas ativas.

Organizações arquivadas ou com a exibição financeira do Monitoramento desativada
não recebem o resumo. A chave de deduplicação combina a semana civil e o
destinatário, então os ciclos de 15 minutos não repetem a notificação. A função
respeita o fuso configurado, usa **America/Sao_Paulo** como fallback e não
movimenta saldo, não baixa lançamentos, não cria pagamentos, tarefas, e-mails ou
mensagens externas. O mesmo relógio privado permanece único.

## Qualidade dos dados

Toda terça-feira, depois das 08:00 no fuso horário da organização, uma
verificação privada procura somente inconsistências estruturais comprováveis:
organização ativa sem proprietário ativo; metadados de conclusão de tarefas
incompatíveis com o status; responsáveis inativos ainda vinculados a tarefas,
clientes, processos, comunicações ou lançamentos; cliente divergente entre um
registro e seu processo; e contadores de documentos de processo inválidos.

A verificação não repete alertas de prazo, vencimento ou itens sem responsável,
que já possuem automações próprias. Quando encontra inconsistências, cria uma
única notificação semanal para proprietários, administradores e gestores ativos,
com os totais separados por módulo. Organizações arquivadas e registros
arquivados são ignorados. Se não houver problema, nenhuma notificação é criada.

A automação não corrige cadastros automaticamente, não cria tarefas e não envia
mensagens externas. A chave de deduplicação combina a semana civil e o
destinatário. O mesmo relógio privado de 15 minutos permanece único, com
**America/Sao_Paulo** como fallback para fusos ausentes ou inválidos.

## Clientes sem contato recente

Clientes ativos geram uma notificação interna, depois das 08:00 no fuso da
organização, ao completar 30 dias civis sem contato registrado. O responsável
ativo pelo cliente recebe o aviso. Quando não há responsável ativo,
proprietários e administradores ativos recebem a notificação. Clientes e
organizações arquivados são ignorados.

A data de última interação é atualizada automaticamente apenas quando uma
interação da Comunicação é marcada como **Contato realizado**. Alterações
meramente cadastrais, notas internas e registros sem contato confirmado não
renovam essa data. Interações antigas registradas posteriormente também não
reduzem uma data de contato mais recente.

A chave de deduplicação combina cliente, instante da última interação, prazo e
destinatário. Assim, o mesmo período sem contato gera um único aviso por pessoa;
um contato confirmado inicia um novo episódio futuro. A varredura não cria
tarefas, não muda o status do cliente e não envia mensagens externas. Cada ciclo
cria no máximo 200 notificações pendentes e reutiliza o único relógio privado de
15 minutos, com **America/Sao_Paulo** como fallback de fuso.

## Aniversários de clientes

Clientes pessoa física, ativos, não arquivados e com data de nascimento recebem
dois lembretes internos: sete dias antes do aniversário e no próprio dia. A
verificação começa depois das 08:00 no fuso horário da organização. Em anos não
bissextos, aniversários cadastrados em 29 de fevereiro são considerados em 28 de
fevereiro.

O responsável interno ativo pelo cliente recebe o aviso. Quando não existe um
responsável ativo, superadministradores, proprietários e administradores ativos
recebem a notificação.
A opção **Aniversários de clientes**, em **Configurações > Notificações**, permite
desativar essa categoria para toda a organização.

A chave de deduplicação combina cliente, ano, etapa e destinatário, impedindo
repetições durante os ciclos de 15 minutos e permitindo novos avisos no ano
seguinte. A automação não cria tarefas, não altera o cadastro e não envia e-mail
ou WhatsApp. Cada ciclo cria no máximo 200 notificações pendentes e reutiliza o
relógio privado único, com **America/Sao_Paulo** como fallback de fuso.
