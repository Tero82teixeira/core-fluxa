# Copiloto e Triagem Inteligente de Comunicação

O recurso entrega duas melhorias integradas na Central de Comunicação:

1. **Copiloto de Comunicação:** resume o histórico público, sugere uma resposta e revisa riscos de privacidade no rascunho.
2. **Triagem Inteligente:** sugere prioridade e próxima ação com uma justificativa baseada no histórico.

Nenhuma mensagem é enviada e nenhuma prioridade é alterada automaticamente. A equipe precisa usar os botões **Usar como rascunho** e **Aplicar prioridade**.

## Implantação

Após aplicar a migration `20260917120000_communication_copilot.sql`, configure os segredos do projeto Supabase:

```bash
supabase secrets set OPENAI_API_KEY="sua-chave"
supabase secrets set OPENAI_MODEL="gpt-5-mini"
supabase functions deploy communication-copilot
```

`OPENAI_MODEL` é opcional; quando ausente, a função usa `gpt-5-mini`.

O proprietário ou administrador ativa o recurso em **Configurações → Comunicação → Copiloto de Comunicação com IA**. Ele permanece desativado por padrão.

## Segurança e privacidade

- A função exige JWT válido do Supabase e usa o token do próprio usuário para buscar o contexto.
- O navegador nunca recebe `OPENAI_API_KEY`.
- A RPC aceita somente membros com permissão de escrita na Comunicação.
- São enviados no máximo os 40 registros públicos mais recentes, com limites de tamanho.
- Notas internas, campos cadastrais de clientes, nomes da equipe e dados financeiros não são retornados pela RPC. Como o texto livre pode conter dados pessoais digitados por usuários, ele ainda deve ser revisado antes da análise.
- O rascunho é enviado apenas quando a pessoa solicita sua revisão.
- A requisição ao provedor usa `store: false`.
- Auditorias registram usuário, conversa, modo e quantidade de registros, mas nunca o conteúdo.
- Há limite de 30 solicitações por usuário e organização a cada hora.

Antes de ativar em produção, a empresa deve atualizar seus Termos de Uso e Política de Privacidade para informar o tratamento pelo provedor de IA e confirmar que a configuração atende às suas obrigações de proteção de dados.

## Operação

Se a interface informar que a integração ainda não foi configurada, confirme os segredos e o deploy da Edge Function. Se o limite por hora for atingido, aguarde a janela seguinte. Falhas no provedor não enviam mensagens nem alteram prioridades.
