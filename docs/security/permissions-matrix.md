# Matriz de permissões

## Princípio de segurança

Ocultar um botão melhora a interface, mas **não é autorização**. Toda operação crítica é
validada novamente pelo Supabase com membership ativa, papel e organização. Assim, uma
chamada manual à API recebe a mesma restrição que uma ação feita pela aplicação.

## Papéis ativos

| Capacidade | Proprietário | Administrador | Gestor | Operacional | Visualizador |
|---|:---:|:---:|:---:|:---:|:---:|
| Clientes e processos | Total | Total | Total operacional | Executar | Leitura |
| Tarefas | Total | Total | Total operacional | Executar | Leitura |
| Upload / nova versão de documento | Sim | Sim | Sim | Sim | Não |
| Revisar (aprovar, rejeitar, reanalisar) | Sim | Sim | Não | Não | Não |
| Arquivar / restaurar documento | Sim | Sim | Não | Não | Não |
| Monitoramento | Total | Total | Administrativo | Operacional | Leitura |
| Visualizar / gerenciar financeiro | Sim | Sim | Sim | Não | Não |
| Gerenciar equipe | Sim | Sim | Não | Não | Não |
| Visualizar relatórios | Sim | Sim | Sim | Sim | Sim |
| Exportar relatórios | Sim | Sim | Sim | Sim | Não |

O Operacional pode enviar uma nova versão, que volta a `em_analise` e perde os dados da
revisão anterior, mas não pode aprovar, rejeitar, arquivar ou restaurar. O Gestor também
não executa revisão ou arquivamento.

As RLS financeiras exigem papel financeiro autorizado. Responsabilidade por cliente,
processo, tarefa ou transação nunca concede acesso aos valores para Operacional ou
Visualizador, inclusive em dados derivados protegidos pelas tabelas de origem.

`atendimento`, `financeiro` e `cliente_externo` permanecem papéis antigos/reservados:
eles não fazem parte da matriz ativa e não recebem permissões novas implicitamente.
