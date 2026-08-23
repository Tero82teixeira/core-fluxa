# Fundação de automações temporais

Esta etapa adiciona somente a fundação de banco para regras com
`trigger_type = 'scheduled'`. A configuração fica em `automation_schedules`,
separada das regras orientadas a eventos, e guarda tipo, intervalo ou horário,
timezone, estado e os instantes da última e da próxima execução.

## Disparo operacional

O job `core-fluxa-process-due-scheduled-automations` executa a cada 15 minutos,
como papel `postgres`, no próprio banco operacional:

```sql
select public.process_due_scheduled_automations();
```

A função não recebe `organization_id`: ela seleciona regras vencidas no banco e
obtém o tenant pela relação composta entre agenda e regra. Ela não está exposta
a `PUBLIC`, `anon` ou `authenticated`. A migration remove qualquer job anterior
com o mesmo nome antes de recriá-lo, de modo que reaplicações não acumulam jobs.

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
criação permanece oculta até existir um disparador operacional confiável.

## Concorrência e idempotência

Cada lote usa `FOR UPDATE SKIP LOCKED`. Além disso, cada par agenda/ciclo possui
índice único em `automation_executions`; portanto, chamadas repetidas ou
concorrentes não repetem o mesmo ciclo. Falhas são registradas individualmente e
não interrompem as demais agendas.

Condições sobre registros antigos e os casos de negócio (processo parado,
documento vencendo, follow-up e resumo diário) não fazem parte desta etapa. A
interface permite programações diárias ou por intervalo de dias para criar
tarefas, notificações internas, registros de auditoria ou resumos das pendências
já identificadas pela Central de Monitoramento. O resumo respeita as preferências
da organização, agrupa itens por responsável e encaminha itens sem responsável
a proprietários e administradores ativos.
