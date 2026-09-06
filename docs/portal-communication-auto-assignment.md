# Distribuição automática dos atendimentos do portal

A opção **Distribuir automaticamente atendimentos do portal**, em
**Configurações > Comunicação**, atribui conversas sem responsável assim que
uma nova mensagem pública do cliente chega pelo Portal do Cliente. O recurso é
opcional e permanece desativado por padrão.

## Regra de distribuição

A seleção usa somente membros ativos da mesma organização que possam trabalhar
com comunicações. Gestores e operacionais têm prioridade; se nenhum deles
estiver disponível, o sistema usa superadministradores, proprietários ou
administradores como contingência.

Dentro de cada grupo, recebe o atendimento quem tiver menos conversas abertas
atribuídas. Empates são resolvidos pela atividade atribuída mais antiga e, por
fim, por um identificador estável. Um bloqueio transacional por organização
evita que mensagens simultâneas escolham a mesma carga desatualizada.

## Limites e segurança

- conversas que já possuem responsável nunca são redistribuídas;
- mensagens internas ou enviadas pela equipe não acionam a regra;
- conversas resolvidas, arquivadas ou de outra organização são ignoradas;
- a atribuição gera auditoria e uma notificação interna para o responsável;
- nenhum dado adicional da equipe é exposto ao cliente;
- a seleção é executada somente pelo banco e não depende de cron, chave de
  serviço ou chamada HTTP.

Ao desativar a opção, novas conversas continuam entrando sem responsável para
triagem manual. Atendimentos anteriormente atribuídos permanecem inalterados.
