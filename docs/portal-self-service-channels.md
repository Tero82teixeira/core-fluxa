# Autoatendimento, canais oficiais e relatório de atendimento

Esta entrega adiciona três recursos integrados ao módulo de comunicação:

- uma base de perguntas frequentes no Portal do Cliente, com pesquisa, avaliação e encaminhamento para a equipe;
- envio e recebimento pelo WhatsApp Cloud API e por e-mail com Resend;
- um relatório gerencial de conversas, tempo de primeira resposta, canais e efetividade do autoatendimento.

## Publicação

1. Publique a aplicação pelo Lovable depois que o PR estiver integrado.
2. Execute `supabase/migrations/20260922120000_portal_self_service_channels_analytics.sql` no SQL Editor do projeto Supabase.
3. Implante as Edge Functions `communication-channel-send` e `communication-channel-webhook`.
4. Cadastre os segredos abaixo nas configurações das Edge Functions. Nunca salve esses valores no GitHub, no navegador ou nas tabelas da aplicação.

| Provedor | Segredo                      | Uso                                                |
| -------- | ---------------------------- | -------------------------------------------------- |
| Meta     | `META_WHATSAPP_ACCESS_TOKEN` | Token permanente do WhatsApp Cloud API             |
| Meta     | `META_GRAPH_VERSION`         | Versão ativa da Graph API, por exemplo `v23.0`     |
| Meta     | `META_WHATSAPP_VERIFY_TOKEN` | Valor definido pela empresa para validar o webhook |
| Meta     | `META_WHATSAPP_APP_SECRET`   | Assinatura HMAC das notificações recebidas         |
| Resend   | `RESEND_API_KEY`             | Envio e leitura de e-mails recebidos               |
| Resend   | `RESEND_WEBHOOK_SECRET`      | Validação Svix das notificações recebidas          |

## Webhooks

Configure os provedores com as URLs do projeto:

- WhatsApp: `https://nobtbymxudlcsyurbopl.supabase.co/functions/v1/communication-channel-webhook?provider=whatsapp`
- Resend: `https://nobtbymxudlcsyurbopl.supabase.co/functions/v1/communication-channel-webhook?provider=resend`

No WhatsApp, assine o campo de mensagens e use o mesmo valor de `META_WHATSAPP_VERIFY_TOKEN` na verificação. No Resend, habilite o evento `email.received` para o domínio de recebimento.

## Configuração no FLUXA

Em **Configurações → Comunicação → Canais oficiais**, informe somente:

- o ID do número no WhatsApp e o nome de exibição; ou
- o endereço remetente/caixa de entrada do Resend e o nome de exibição.

Ative o canal somente depois de cadastrar os segredos e webhooks. Mensagens de remetentes que não correspondem automaticamente a um cliente aparecem em **Comunicação → Mensagens aguardando vínculo**, onde a equipe pode selecionar o cadastro correto.

Em **Configurações → Comunicação → Perguntas frequentes**, revise os três artigos iniciais, ajuste o texto para a empresa e publique novos artigos. O cliente encontra o conteúdo em **Meu Portal → Ajuda**.

O resultado fica disponível em **Relatórios → Atendimento**. Os indicadores respeitam o período selecionado e o isolamento por empresa.
