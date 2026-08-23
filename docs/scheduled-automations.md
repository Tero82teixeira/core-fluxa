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

A interface permite programações diárias ou por intervalo de dias para criar
tarefas, notificações internas, registros de auditoria ou resumos das pendências
já identificadas pela Central de Monitoramento. O resumo respeita as preferências
da organização, agrupa itens por responsável e encaminha itens sem responsável
a proprietários e administradores ativos.
