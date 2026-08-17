# Automações por etapa do processo — V1

## Motor e evento

A Fase 2 evolui o motor existente (`process_automation_event`) e continua usando `automation_rules` e `automation_executions`; não há fila, log ou executor paralelo. O trigger de processos emite `process.created`, `process.owner_changed` e `process.stage_changed`. Neste último, o payload contém:

- `stage`: etapa atual, preservada para regras legadas;
- `from_stage`: etapa anterior;
- `to_stage`: nova etapa.

No cadastro visual, “Quando o processo mudar para” grava uma condição `to_stage equals <etapa>`. Condições antigas sobre `stage` continuam válidas. Atualizações sem mudança de etapa não emitem o evento.

## Ações operacionais

### `create_task`

Aceita título, descrição, prioridade (`baixa`, `media`, `alta`, `critica`), status inicial aberto (`pendente`, `em_andamento`, `aguardando`), prazo de 0 a 365 dias e responsável. Quando o evento é de processo, o `process_id` e o `client_id` são sempre herdados do processo validado na organização; IDs configurados não substituem esses vínculos.

`assignee_mode` pode ser:

- `process_owner`: responsável atual do processo;
- `fixed_user`: membro ativo explicitamente escolhido;
- `rule_creator`: criador da regra;
- `unassigned`: sem responsável.

Regras antigas apenas com `assignee_id` são interpretadas como `fixed_user`. O membro é validado na organização no momento da execução.

### `create_checklist_item`

Disponível somente para eventos de processo. Cria o item com status `pendente`, título, descrição, obrigatoriedade, prazo de 0 a 365 dias e a próxima posição (`max(position) + 1`). A tabela atual não possui `assignee_id`; portanto a V1 não configura responsável no checklist.

Após tarefa ou checklist criado por um processo, o motor registra uma movimentação informativa com ator “Automação”, sem alterar a etapa e sem produzir loop.

## Execução, deduplicação e segurança

Cada tentativa continua registrada em `automation_executions` como `success`, `failed` ou `skipped`. Condições não atendidas geram `skipped`; configurações ou vínculos inválidos falham com mensagem segura. A chave de deduplicação existente combina regra, entidade, evento e versão/payload, e os limites de profundidade continuam impedindo ciclos.

Somente `superadmin`, `proprietario` e `administrador` podem administrar regras, tanto pela interface quanto pelas RPCs protegidas por `automation_can_manage`. Os demais papéis mantêm consulta/histórico conforme RLS.

O executor consulta processo, cliente e membro por `organization_id`. Assim, uma configuração não pode ligar tarefa/checklist a outro tenant. Não são aceitos SQL, código, URL externa ou credenciais, e nenhuma regra ativa é criada pela migration.

## Exemplos

- **Aguardando documentos** → criar tarefa **“Solicitar documentos”** → prazo **3 dias** → **responsável do processo**.
- **Aguardando documentos** → criar checklist **“Documento de identificação”**, obrigatório, prazo de 3 dias.
