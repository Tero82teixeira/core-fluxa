# Métricas de produto (PostHog)

A FLUXA usa uma integração opcional com PostHog para medir o funil de ativação sem enviar o
conteúdo operacional das empresas.

## Configuração

Defina as variáveis no ambiente de publicação:

- `VITE_POSTHOG_KEY`: token público do projeto PostHog;
- `VITE_POSTHOG_HOST`: host de ingestão informado pelo PostHog (opcional; o padrão é
  `https://us.i.posthog.com`).

Sem `VITE_POSTHOG_KEY`, a integração e o aviso de consentimento permanecem inativos. Em
desenvolvimento, ela também fica desligada; para um teste local deliberado, use
`VITE_POSTHOG_ENABLE_DEV=true`.

## Privacidade

- coleta somente após consentimento explícito;
- autocaptura, gravação de sessão, pesquisas e carregamento externo de extensões desativados;
- caminhos dinâmicos são normalizados antes do envio;
- nomes, e-mails, telefones, documentos, arquivos e textos digitados não são enviados;
- a identificação autenticada usa somente o UUID técnico do usuário;
- a recusa não altera nenhum recurso do sistema.

## Eventos do funil

- `page_viewed`
- `account_signup_completed`
- `confirmation_email_resent`
- `user_signed_in`
- `password_reset_requested`
- `organization_onboarding_completed`
- `client_created`
- `process_created`
- `task_created`
- `document_uploaded`
- `subscription_checkout_started`
