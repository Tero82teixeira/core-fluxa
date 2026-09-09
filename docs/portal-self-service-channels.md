# Autoatendimento e relatório do atendimento pelo FLUXA

Esta entrega adiciona recursos integrados ao módulo de comunicação:

- uma base de perguntas frequentes no Portal do Cliente, com pesquisa, avaliação e encaminhamento para a equipe;
- atendimento centralizado no chat seguro do Portal do Cliente;
- um relatório gerencial de conversas, tempo de primeira resposta, canais e efetividade do autoatendimento.

As fundações técnicas para canais externos permanecem disponíveis, mas a interface não exige nem
expõe configuração de WhatsApp Cloud API ou Resend. O atendimento operacional acontece no FLUXA.

## Publicação

1. Publique a aplicação pelo Lovable depois que o PR estiver integrado.
2. Execute `supabase/migrations/20260922120000_portal_self_service_channels_analytics.sql` no SQL Editor do projeto Supabase.

O chat do Portal do Cliente não exige credenciais externas, segredos ou webhooks. As fundações
técnicas de canais externos permanecem inativas e não fazem parte da configuração operacional.

## Configuração no FLUXA

Em **Comunicação**, a equipe abre o atendimento do cliente e usa **Responder no FLUXA**. A mensagem
fica no histórico autorizado da conversa e aparece no Portal do Cliente. Notas marcadas como internas
continuam visíveis somente para a equipe.

Em **Configurações → Comunicação → Perguntas frequentes**, revise os três artigos iniciais, ajuste o texto para a empresa e publique novos artigos. O cliente encontra o conteúdo em **Meu Portal → Ajuda**.

O resultado fica disponível em **Relatórios → Atendimento**. Os indicadores respeitam o período selecionado e o isolamento por empresa.
