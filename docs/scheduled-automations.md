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

A interface permite programações diárias ou por intervalo de dias para criar
tarefas, notificações internas, registros de auditoria ou resumos das pendências
já identificadas pela Central de Monitoramento. O resumo respeita as preferências
da organização, agrupa itens por responsável e encaminha itens sem responsável
a proprietários e administradores ativos.
