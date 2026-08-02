# Arquitetura

FLUXA é uma aplicação TanStack Start/React. Rotas e componentes ficam em `src/routes` e `src/components`; hooks concentram acesso operacional; `src/integrations/supabase` separa clientes browser/server; e `src/lib` contém regras reutilizáveis. O Supabase é a fonte de autenticação e persistência.

## Limites de confiança

O browser usa somente URL e chave pública. Segredos de serviço são lidos exclusivamente no módulo `.server.ts`. Toda entidade multitenant deve carregar `organization_id`; filtros no cliente melhoram UX, mas RLS é a fronteira de autorização. Arquivos usam bucket privado e caminho iniciado pelo ID da organização.
