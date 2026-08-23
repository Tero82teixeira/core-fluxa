# Deploy do banco de dados

Este é o procedimento operacional oficial para mudanças de banco.

## 1. Arquitetura

- O Lovable Cloud é o backend operacional principal.
- O project ref operacional é `nobtbymxudlcsyurbopl`.
- O project ref `znfcyvoldoekrxuxrcnf` pertence a um projeto Supabase auxiliar:
  ele não hospeda o banco operacional, mas preserva a Edge Function legada
  `send-team-invitation`, configurada para aceitar a origem
  `https://core-fluxa.lovable.app`.
- O frontend atual não invoca essa Edge Function. Convites são criados
  diretamente pela RPC segura `create_invitation` no backend operacional. Na
  verificação de 2026-08-21, a função auxiliar registrava zero invocações desde
  o último deploy.
- Nunca troque, substitua ou confunda esses refs sem uma investigação explícita
  da arquitetura.

## 2. Regra principal

Nenhuma migration deve ser aplicada automaticamente ao Lovable Cloud pelo
GitHub Actions. Não use `supabase link` nem `supabase db push` para esse backend.

O workflow **Supabase Final Validation** apenas executa validação local e
reprodutível; ele não realiza deploy remoto. Uma migration mergeada no GitHub
não deve ser considerada aplicada no Lovable Cloud.

## 3. Fluxo obrigatório para qualquer migration futura

Siga exatamente esta ordem:

1. Criar uma migration nova, aditiva e timestampada.
2. Adicionar ou atualizar testes estáticos e, quando aplicável, pgTAP.
3. Abrir um pull request (PR).
4. Aguardar os checks obrigatórios `quality` e `validate`.
5. Revisar o diff.
6. Fazer merge somente após os checks ficarem verdes.
7. Aplicar a migration de forma controlada no Lovable Cloud, pelo mecanismo
   suportado pelo próprio Lovable Cloud.
8. Executar queries read-only para confirmar que schema, policies, grants e
   functions ficaram como esperado.
9. Executar um teste funcional do fluxo afetado na aplicação.
10. Registrar a aplicação e a verificação no histórico da mudança.

## 4. Proibições

- Não aplicar migration em project ref não confirmado.
- Não aplicar as migrations do Core Fluxa no projeto auxiliar
  `znfcyvoldoekrxuxrcnf`.
- Não remover a Edge Function ou os secrets do projeto auxiliar sem conferir
  invocações, logs e dependências externas.
- Não alterar `project_id` apenas para “fazer funcionar”.
- Não recriar workflows de deploy remoto para o Lovable Cloud sem reabrir a
  arquitetura.
- Não usar `service_role`, anon key ou JWT de usuário como credencial
  administrativa da Management API.
- Não considerar “merge no GitHub” equivalente a “aplicado na Cloud”.
- Não editar migrations antigas já aplicadas; criar uma migration nova e
  aditiva.
- Não remover RLS, grants ou guards para contornar erro funcional.

## 5. Checklist pós-deploy

- [ ] Migration aplicada no Lovable Cloud correto
- [ ] Queries read-only conferidas
- [ ] RLS/policies/grants conferidos quando afetados
- [ ] Funções/triggers conferidos quando afetados
- [ ] Teste funcional executado
- [ ] Aplicação continua estável após refresh/login
- [ ] Sem drift conhecido entre repo e Cloud

## 6. Incidente de drift

Se houver divergência entre GitHub e Lovable Cloud:

1. Primeiro, mapear o estado real em modo read-only.
2. Comparar a migration esperada com os objetos reais.
3. Não reaplicar tudo cegamente.
4. Corrigir apenas o delta necessário.
5. Registrar a causa.

## 7. Governança GitHub

A branch `main` é protegida. Todo PR deve passar pelos checks obrigatórios
`quality` e `validate` antes do merge.
