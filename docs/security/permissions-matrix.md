# Matriz ativa de permissões

Esta matriz documenta os papéis atualmente atribuíveis pela tela **Equipe** e deve permanecer alinhada com `src/lib/access-control.ts` e com as policies/RPCs do Supabase.

| Capacidade | Proprietário | Administrador | Gestor | Operacional | Visualizador |
| --- | --- | --- | --- | --- | --- |
| Operação de clientes/processos | Total | Total | Total | Executa | Somente leitura |
| Tarefas | Total | Total | Total | Executa | Somente leitura |
| Upload de documentos | Sim | Sim | Sim | Sim | Não |
| Aprovar/rejeitar documentos | Sim | Sim | Não | Não | Não |
| Arquivar/restaurar documentos | Sim | Sim | Não | Não | Não |
| Monitoramento | Total | Total | Total | Acompanha | Somente leitura |
| Financeiro | Total | Total | Total | Sem acesso a valores | Sem acesso a valores |
| Equipe | Gerencia | Gerencia | Consulta | Consulta | Consulta |
| Exportar relatórios | Sim | Sim | Sim | Sim | Não |

## Papéis reservados

`atendimento`, `financeiro` e `cliente_externo` continuam existentes no enum para evolução futura, mas não fazem parte de `TEAM_ROLES` nem podem ser atribuídos pelos RPCs atuais de convite/alteração de função. Enquanto não houver um fluxo dedicado e testes completos, a matriz de frontend não lhes concede capacidades operacionais.

## Regras de segurança importantes

- Esconder um botão não é considerado autorização. A operação sensível deve ser validada no Supabase.
- Operacional pode enviar uma nova versão de documento, mas não pode aprovar, rejeitar, arquivar ou forjar autoria/revisão.
- Uma versão de documento deve pertencer à mesma organização do documento original.
- Financeiro não deve expor valores a Operacional ou Visualizador, mesmo que o lançamento esteja vinculado a cliente, processo ou tarefa desses usuários.
- O catálogo `role_permissions` deve refletir esta matriz, mesmo quando uma regra crítica também é reforçada diretamente por RLS/RPC/trigger.
