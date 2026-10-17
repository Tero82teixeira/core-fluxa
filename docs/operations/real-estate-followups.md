# Retornos e histórico imobiliário

## Ativação

Execute `real-estate-followups.sql` completo no SQL Editor do banco operacional `nobtbymxudlcsyurbopl`, após a ativação de atendimento/vitrine da etapa anterior. Depois faça **Lovable → Publish → Update**. Não execute no projeto auxiliar de migração de funções. A migration correspondente instala os mesmos objetos nos ambientes de validação.

## Uso

Em **Imobiliária → Atendimento e visitas → Fila de atendimento**:

- **Próximo retorno** define um horário futuro ou, deixando vazio, remove o planejamento. A alteração entra no histórico. O limite de planejamento é de dois anos. Pedidos encerrados não recebem novos retornos.
- O filtro **Próximos retornos** permite vencidos, hoje, futuros ou sem horário. Ao selecionar esse filtro, a situação é aberta para mostrar os pedidos não encerrados correspondentes. A lista coloca os retornos vencidos primeiro, seguidos dos planejados. Busca, responsável e paginação continuam disponíveis.
- **Abrir WhatsApp** abre uma mensagem para o telefone informado pelo interessado, incluindo o código do imóvel. A equipe confere o destinatário e confirma o envio no WhatsApp. Isso não registra a conversa nem prova a identidade de quem informou o número.
- **Registrar conversa** guarda canal e resultado. Informe um próximo horário ou deixe vazio para ficar sem próximo retorno. Salvar não envia mensagem nem confirma visita. Uma conversa nova não altera a situação ou o responsável do pedido; essas alterações continuam em **Atender / atribuir**.
- **Histórico do cliente** reúne pedidos vinculados ao cliente, imóveis de interesse, visitas, estado mais recente de cada proposta, conversas e planejamento. Para pedidos sem cliente vinculado, exibe apenas o próprio pedido e seus registros. Nunca reúne pessoas por nome ou telefone. A consolidação depende do vínculo manual já existente, confirmado pela equipe.

Os horários são armazenados em UTC e apresentados no fuso do dispositivo, identificado no formulário. Um retorno é vencido quando seu instante passou; hoje inclui os horários ainda futuros no dia local; futuros são os dias seguintes. Os filtros e etiquetas usam esse mesmo critério. Ao encerrar um pedido, seu planejamento deixa de aparecer na fila. Reabrir o pedido faz o planejamento anterior reaparecer, podendo exigir revisão.

Não há cron, lembrete por mensagem ou nova notificação automática neste lote. O destaque é na fila de atendimento, atualizada periodicamente. Nada é exposto na vitrine pública ou no portal do cliente.

## Permissões e integridade

O endpoint é SECURITY INVOKER, exclusivo de authenticated, com validação de acesso ao módulo/organização. Os dados novos ficam no schema privado `fluxa_inquiry_private`, com RLS. A escrita respeita os mesmos papéis que podem operar imóveis; perfis somente de leitura podem consultar a fila e o histórico, sem registrar conversas. anon e clientes externos não acessam esses dados.

O histórico de conversas é acrescentado, sem UPDATE/DELETE para os usuários da aplicação. O banco registra autor e instante; esses campos não vêm do formulário. Cada salvamento verifica a versão do pedido e tem um identificador de evento para reenvio idempotente. A chave estrangeira composta impede vínculo com pedido de outra empresa. Consultas retornam 20 itens por página e usam índices por organização, pedido e data.

## Demonstração

O mesmo endereço `/demo?area=real_estate`, na aba Atendimento e visitas, apresenta um retorno vencido fictício, filtros, definição/limpeza de horário, conversa em memória e histórico expansível. O histórico do exemplo de Marina mostra também a proposta demonstrativa, com o estado alterado pelas ações da aba Propostas. Os exemplos continuam isolados do banco e são reiniciados ao recarregar. O relógio dos retornos da demonstração segue o cenário de 16/10/2026 indicado na página.

## Verificação e reversão

Tipos, lint, testes, build e pgTAP são executados no CI. A integração PGlite valida planejamento, limpeza, atrasos, conflitos de versão, reenvio, conversas imutáveis, consolidação pelo cliente, isolamento, papéis e paginação. A migração é reaplicada para verificar idempotência.

Para suspender apenas os novos recursos, reverta a atualização da interface e revogue EXECUTE de authenticated na função `public.real_estate_followups(uuid,text,uuid,jsonb)`. Os dados podem ser preservados; a versão anterior da fila continua usando `real_estate_inquiry_manage`. Reaplicar o SQL restaura a permissão do endpoint. Nenhuma tabela precisa ser excluída.
