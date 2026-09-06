# Fila de triagem do Portal do Cliente

A Central de Atendimento do Portal destaca conversas que chegaram sem
responsável e permite que um membro autorizado assuma o atendimento com um
clique.

## Fluxo

- O indicador **Triagem pendente** mostra conversas ativas e sem responsável.
- Ao selecionar o indicador, a central exibe somente esses atendimentos.
- O botão **Assumir atendimento** atribui a conversa ao próprio usuário
  autenticado e atualiza a carga da equipe.
- Conversas sem responsável ganham prioridade visual na fila, mantendo alertas
  de SLA vencido ou em risco à frente.

## Segurança

A RPC `claim_portal_communication_thread` aceita somente uma conversa ativa,
compartilhada no Portal do Cliente e ainda sem responsável. Ela nunca substitui
um responsável existente. O usuário deve ser membro ativo com permissão de
escrita em Comunicação; visualizadores e clientes externos são bloqueados.

A operação usa bloqueio de linha para impedir que duas pessoas assumam a mesma
conversa simultaneamente e registra a auditoria
`communication.assignee.claimed`.
