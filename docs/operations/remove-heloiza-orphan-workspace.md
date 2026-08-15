# Remoção controlada do workspace órfão da Heloiza

## Estado da investigação

Nenhum dado remoto foi alterado ou excluído. O repositório contém somente URL e chave
pública do Supabase; a tentativa de conexão HTTPS deste ambiente foi bloqueada pelo
proxy (`CONNECT tunnel failed, 403`). Portanto, **não é possível afirmar neste PR o UUID
real nem autorizar a exclusão**. O UUID deve ser obtido e os resultados anexados ao
ticket executando o inventário somente-leitura em uma sessão administrativa:

```bash
psql "$DATABASE_URL" \
  -v heloiza_email='EMAIL_CONFIRMADO' \
  -f scripts/admin/audit-orphan-workspace.sql

# Depois de revisar nome, data e memberships da primeira saída:
psql "$DATABASE_URL" \
  -v heloiza_email='EMAIL_CONFIRMADO' \
  -v orphan_organization_id='UUID_CONFIRMADO' \
  -f scripts/admin/audit-orphan-workspace.sql
```

O script abre uma transação `READ ONLY`, descobre FKs no catálogo (inclusive a ação
`ON DELETE`), procura toda coluna multi-tenant mesmo sem FK, conta todas as linhas do
UUID, verifica Storage e mostra separadamente a membership ativa da Heloiza em Ronaldo.
Ele não depende de uma lista de tabelas que pode ficar obsoleta.

Pelas migrations versionadas, o mapa **esperado** de referências diretas é:

- `ON DELETE CASCADE`: `organization_members`, `organization_settings`,
  `organization_counters`, `organization_invitations`, `clients`,
  `client_addresses`, `client_contacts`, `service_types`, `process_stages`,
  `processes`, `process_movements`, `process_checklist_items`, `document_types`,
  `documents`, `document_versions`, `tasks`, `task_comments`, `task_history`,
  `notifications`, `audit_logs`, `monitoring_items`, `monitoring_history`,
  `monitoring_states`, `monitoring_state_history`, `communication_threads` e
  `communication_entries`;
- `NO ACTION` (ação padrão): `automation_rules`, `automation_executions`,
  `financial_categories`, `financial_accounts`, `financial_recurrences`,
  `financial_transactions`, `financial_transaction_payments`,
  `financial_account_movements` e `support_requests`.

Esse mapa é apenas baseline do código. A saída de `pg_constraint` no banco remoto é a
fonte de verdade e deve coincidir com ele; divergência de schema é `NO-GO`.

## Critério de autorização (go/no-go)

Só há **GO** quando, na mesma execução e imediatamente antes da manutenção:

1. há exatamente um perfil para o e-mail confirmado;
2. o UUID alvo pertence ao workspace nominal da Heloiza e sua membership nele é a
   indevida (`proprietario`);
3. existe exatamente uma membership `operacional`, ativa, da mesma `user_id` na
   organização Ronaldo, cujo `organization_id` é diferente do alvo;
4. os contadores de negócio são zero: clientes, contatos/endereços, processos e
   movimentos, documentos e versões/checklists, tarefas, comunicações, monitoramento,
   automações e todas as tabelas financeiras;
5. apenas registros técnicos esperados permanecem (normalmente
   `organization_members`, `organization_settings`, `organization_counters`,
   `notifications`, `audit_logs` e eventualmente `organization_invitations`);
6. não há coluna `organization_id` fora do mapa contado, FK `NO ACTION`/`RESTRICT`,
   objeto em Storage, convite pendente ou resultado inesperado. Qualquer ocorrência
   deve ser revisada; não se prossegue por suposição.

Sem a evidência acima, a resposta é **NO-GO**. A confirmação manual de que a interface
está vazia não cobre registros arquivados, técnicos, Storage ou tabelas novas.

## Operação administrativa proposta

Não criar migration: é uma correção pontual de dados e uma migration seria executada
em todos os ambientes. Fazer backup/PITR e registrar operador, ticket, UUID alvo,
contagens e horário. Usar acesso de banco administrativo, janela controlada e uma única
transação com `lock_timeout`/`statement_timeout`.

Ordem segura:

1. iniciar transação e bloquear a linha alvo em `organizations` com `FOR UPDATE`;
2. repetir dentro da transação as guardas de identidade, UUID distinto, membership
   `operacional` ativa em Ronaldo e ausência de dados de negócio;
3. remover primeiro objetos do bucket `organization-documents`, se o inventário os
   encontrar (preferencialmente pela API administrativa do Storage); parar se a remoção
   não for integral;
4. remover filhos que tenham FK `NO ACTION`/`RESTRICT`, dos mais dependentes para os
   pais. No esquema versionado, a ordem é `automation_executions`, `automation_rules`,
   `financial_account_movements`, `financial_transaction_payments`,
   `financial_transactions`, `financial_recurrences`, `financial_accounts`,
   `financial_categories` e `support_requests` (sempre condicionando cada comando ao
   UUID alvo e exigindo as contagens previamente aprovadas);
5. excluir **uma única** linha de `public.organizations` usando o UUID literal e exigir
   `ROW_COUNT = 1`. As FKs `ON DELETE CASCADE` removem os filhos técnicos e de domínio
   mapeados, inclusive membership somente do workspace alvo, configurações,
   contadores, notificações, logs, convites, clientes, processos, tarefas, documentos,
   monitoramento, automações e comunicações;
6. repetir inventário e validação de Ronaldo antes do commit; exigir zero linha para o
   UUID alvo e exatamente a membership esperada em Ronaldo;
7. `COMMIT` somente após dupla revisão. Em qualquer divergência, `ROLLBACK`.

A operação é idempotente no nível do objetivo: antes de executar, se a organização
alvo já não existir, deve encerrar com sucesso sem tocar em nenhuma membership; se
existir, todas as guardas precisam passar. Nunca usar nome, e-mail, `LIKE`, subconsulta
ambígua ou o `user_id` da Heloiza como predicado de exclusão. Não excluir o perfil nem
o usuário de `auth.users`.

## Validação posterior obrigatória

Executar novamente o inventário com os mesmos parâmetros e arquivar a saída. Confirmar:

- `organizations.id = UUID_ALVO`: zero;
- toda tabela/Storage para `UUID_ALVO`: zero;
- perfil/auth da Heloiza: preservado;
- membership por **ID previamente registrado** em Ronaldo: mesma `user_id`, mesmo
  `organization_id`, `role = 'operacional'` e `is_active = true`;
- login da Heloiza seleciona Ronaldo e uma leitura autorizada funciona, sem recriar um
  workspace próprio.

## Conclusão explícita

**Neste momento o workspace ainda não pode ser declarado removível com segurança**, pois
o UUID e as contagens remotas não puderam ser verificados neste ambiente. Se todas as
guardas `GO` forem comprovadas, ele pode ser removido por operação manual controlada.
Os registros técnicos do workspace alvo que também precisam desaparecer são membership,
configurações, contador, notificações, audit logs e convites (além de qualquer linha
descoberta dinamicamente); a membership da Heloiza em Ronaldo é outra linha, vinculada a
outro `organization_id`, e deve permanecer intacta e ser validada antes e depois pelo seu
próprio `membership_id`.
