# Suíte real de integração Supabase

Esta suíte reconstrói **somente o Supabase local**, aplica todas as migrations em ordem,
executa todos os arquivos pgTAP em `supabase/tests` (inclusive `database/`) e compara as
tabelas e funções do banco reconstruído com `src/integrations/supabase/types.ts`.

## Pré-requisitos

- Docker
- Supabase CLI
- Node.js 22

## Execução

```bash
npm run test:integration
```

O runner executa, sem mascarar falhas:

1. `supabase start`;
2. `supabase db reset --local`;
3. `supabase test db --local`;
4. `npm run test:integration:parity`;
5. `supabase stop --no-backup`, inclusive quando uma etapa anterior falha.

Os comandos individuais permanecem disponíveis como `test:integration:setup`,
`test:integration:rls` e `test:integration:parity`. A verificação de parity é somente
diagnóstica: ela não regenera nem altera os types versionados.

## Cobertura pgTAP

- isolamento RLS e cross-organization;
- permissões de RPCs;
- `automation_conditions_match`;
- `accept_invitation`;
- policies de Comunicação;
- schema e isolamento de Monitoramento.

Uma falha deve ser documentada, nunca corrigida por esta suíte mediante alteração de
regra de produção.
