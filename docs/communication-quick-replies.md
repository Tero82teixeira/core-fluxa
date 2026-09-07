# Respostas rápidas da comunicação

## Objetivo

Permitir que a equipe ganhe tempo em mensagens recorrentes sem automatizar o envio. O modelo escolhido apenas é inserido no campo de texto; uma pessoa deve revisar e confirmar o envio.

## Onde usar

- Central de Comunicação, em interações públicas;
- botão flutuante **Atender clientes**;
- Configurações → Comunicação, para administrar os modelos.

Respostas rápidas não aparecem em notas internas.

## Permissões e isolamento

- proprietário, administrador, gestor e superadministrador podem criar, editar, ativar ou pausar modelos;
- operacional pode usar modelos ativos no atendimento;
- visualizador e cliente não conseguem listar nem alterar modelos;
- toda leitura e escrita passa por RPC com `auth.uid()` e validação da organização;
- a tabela não concede acesso direto a `authenticated` nem `anon`;
- uma atualização exige que o modelo e a organização coincidam, impedindo acesso cruzado entre empresas.

## Privacidade e auditoria

Criação e alteração geram auditoria com título, categoria e situação do modelo. O corpo da mensagem não é copiado para o log de auditoria, reduzindo exposição desnecessária de conteúdo.

## Comportamento da interface

Ao escolher um modelo, o sistema preserva o texto já digitado e acrescenta a resposta em um novo parágrafo. Nada é enviado automaticamente. Modelos pausados continuam no histórico administrativo, mas deixam de aparecer para uso da equipe.

Quatro sugestões iniciais são cadastradas para organizações existentes quando a migração é aplicada. Organizações sem modelos podem cadastrá-los em Configurações → Comunicação.
