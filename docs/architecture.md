# Arquitetura

FLUXA é uma aplicação TanStack Start/React. Rotas e componentes ficam em `src/routes` e `src/components`; hooks concentram acesso operacional; `src/integrations/supabase` separa clientes browser/server; e `src/lib` contém regras reutilizáveis. O Supabase é a fonte de autenticação e persistência.

O backend operacional usa o project ref `nobtbymxudlcsyurbopl`. O projeto
Supabase auxiliar `znfcyvoldoekrxuxrcnf` não armazena os dados da aplicação e
mantinha, nos recursos auditados em 2026-08-21, a Edge Function legada
`send-team-invitation`. O frontend atual usa a RPC `create_invitation` no
backend operacional e não invoca essa função.

## Limites de confiança

O browser usa somente URL e chave pública. Segredos de serviço são lidos exclusivamente no módulo `.server.ts`. Toda entidade multitenant deve carregar `organization_id`; filtros no cliente melhoram UX, mas RLS é a fronteira de autorização. Arquivos usam bucket privado e caminho iniciado pelo ID da organização.
