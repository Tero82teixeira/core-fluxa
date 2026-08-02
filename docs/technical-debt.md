# Dívida técnica

- Separar exports auxiliares de componentes para reativar `react-refresh/only-export-components`.
- Tipar respostas Supabase ainda declaradas como `any` e reativar `no-explicit-any`.
- Revisar dependências de hooks e reativar `react-hooks/exhaustive-deps`.
- Adicionar suíte de integração com banco descartável para RLS/RPC/storage.
- Expandir cobertura além dos módulos instrumentados e definir limites graduais.
- Consolidar o gerenciador adotado; a CI instala pelo `bun.lock` e executa os scripts npm.
