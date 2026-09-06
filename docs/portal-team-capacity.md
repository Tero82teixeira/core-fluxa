# Disponibilidade e capacidade dos atendimentos do portal

Esta etapa acrescenta controles por membro à distribuição automática das
conversas iniciadas no Portal do Cliente.

## Comportamento

- Proprietário e administrador podem definir se cada membro recebe novas
  conversas automaticamente.
- Cada membro elegível possui um limite entre 1 e 500 conversas abertas.
- A carga considera conversas não arquivadas nos estados aberta, aguardando
  cliente ou aguardando equipe.
- A escolha prioriza gestor e operacional, compara a ocupação proporcional à
  capacidade e usa a data da última distribuição como desempate.
- Membros inativos, pausados, visualizadores ou que atingiram o limite são
  ignorados.
- Se ninguém estiver disponível, a conversa permanece sem responsável para
  triagem manual. A mensagem do cliente continua registrada normalmente.
- Pausar um membro não remove nem transfere conversas já atribuídas.

## Compatibilidade

Na aplicação da migração, membros ativos que já eram elegíveis pela regra
anterior são mantidos como disponíveis, evitando interromper uma distribuição
que já esteja ativada na organização. Novos membros começam pausados e podem
ser habilitados conscientemente na tela **Equipe**.

## Segurança e auditoria

A alteração é feita pela RPC protegida
`update_member_portal_communication_distribution`, restrita a proprietário,
administrador ou superadministrador ativo da mesma organização. Toda mudança
gera o evento de auditoria
`member.portal_communication_distribution_updated`. O seletor interno continua
inacessível aos papéis públicos, anônimos e autenticados.
