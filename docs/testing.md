# Testes

- `npm run test:run`: testes unitários com o runner nativo do Node 22.
- `npm run test:coverage`: cobertura dos módulos explicitamente instrumentados `access-control.ts`, `documents.ts` e `format.ts`.
- `npm run check`: typecheck, lint sem warnings, testes e build.

A cobertura **não representa a aplicação inteira**: seus percentuais abrangem apenas os módulos indicados no comando. Fluxos com Supabase real e RLS exigem o ambiente de integração descrito no plano de RLS.
