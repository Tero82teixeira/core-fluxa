# Deploy do banco de dados

O banco de dados operacional principal é gerenciado pelo Lovable Cloud. Por
isso, migrations destinadas a esse backend não devem ser aplicadas pelo GitHub
Actions com `supabase link` ou `supabase db push`.

O workflow **Supabase Final Validation** permanece responsável somente por
validar as migrations localmente. Ele não realiza deploy de schema no banco
operacional.

Qualquer procedimento futuro para publicar alterações de schema no Lovable
Cloud deve ser definido separadamente e validado antes de ser automatizado.
