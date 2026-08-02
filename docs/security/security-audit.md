# Auditoria de segurança

## Escopo e resultado

Revisão estática de `src`, migrations e configuração em 2026-08-02. Não foram encontrados valores de token, chave privada, senha ou dados pessoais reais versionados. A referência a `SUPABASE_SERVICE_ROLE_KEY` está restrita a `client.server.ts`; o frontend não contém a credencial.

RLS está habilitado nas tabelas multitenant e as políticas recentes usam associação/role organizacional. Migrations históricas contêm políticas amplas para catálogos globais e criação autenticada de organização; migrations posteriores substituem políticas operacionais. Nenhuma migration foi alterada ou criada nesta estabilização.

## Riscos

- A auditoria é estática; validar o estado efetivamente aplicado no banco.
- Funções `SECURITY DEFINER` devem manter `search_path` fixo e grants mínimos.
- Políticas históricas `USING (true)` continuam no histórico para catálogos globais; confirmar que seu estado final é intencional.
- Rotação e detecção de segredos devem existir fora do repositório.
