# FLUXA Imobiliária — pacote Interessados + Visitas

## O que entra

Em Imóveis, cada cartão passa a ter **Interessados e visitas**. Dentro dele:

- Interessado vinculado a um cliente da mesma empresa e ao imóvel, com finalidade Compra/Locação, responsável opcional, observações e situação Novo/Em contato/Em visitas/Encerrado.
- Uma ficha por imóvel + cliente + finalidade. A ficha pode ser editada; não é necessário criar o mesmo interessado outra vez.
- Visitas vinculadas ao interessado, com responsável obrigatório, início e fim, observações, situação Agendada/Realizada/Cancelada/Não compareceu e resultado ou motivo obrigatório ao finalizar.
- Agendamento e reagendamento no futuro; duração de 15 minutos a 4 horas. Visitas realizadas ou sem comparecimento exigem que o horário de início já tenha passado.
- Registro manual de uma visita histórica: ao criar, selecione Realizada e informe horário passado e resultado. Não use isso para marcar uma visita futura como concluída.
- Bloqueio de sobreposição de visitas agendadas do mesmo responsável na mesma empresa, inclusive em imóveis diferentes. Uma visita pode começar no exato minuto em que a anterior termina.
- Filtros por situação, paginação de 20 registros, link Ver cliente e botão Atualizar lista.
- Horários exibidos e preenchidos no fuso do aparelho, informado na tela; banco recebe horários UTC.
- Edição protegida por versão, repetição de criação com o mesmo identificador sem duplicar o registro e auditoria de criação/alteração.

Não gera contratos, propostas, comissões, cobrança, notificação, mensagem WhatsApp ou evento em agenda externa. Visitas aparecem nesta ficha do imóvel; não são copiadas para Tarefas ou Meu Dia neste pacote. Não altera automaticamente a situação do imóvel ou do interessado.

## Antes de instalar

A V1 Imóveis já deve estar publicada, com `real-estate-foundation.sql` aplicado no banco operacional. Esta entrega foi preparada sobre o pacote V1 que você acabou de testar. Não pede secret, conexão PostgreSQL, Docker ou serviço pago.

A única alteração em arquivo existente é `src/routes/_authenticated/imobiliaria.imoveis.tsx`: importa o painel, guarda o imóvel selecionado e inclui o botão e o painel. Os demais arquivos são novos. Se a main recebeu outras alterações nesse arquivo depois da V1, compare a mudança na PR antes de integrar. O patch incluído também permite aplicar apenas estas mudanças em um checkout atualizado.

## Instalação em um lote

1. Baixe e descompacte o ZIP. O ZIP é um pacote de alterações, não o repositório inteiro.
2. Abra `https://github.com/Tero82teixeira/core-fluxa` e selecione **main**.
3. Crie uma branch a partir de main chamada **imobiliaria-interessados-visitas**.
4. Na branch, use **Add file → Upload files**. Arraste as pastas **src**, **docs** e **tests** da pasta descompactada. Não arraste o ZIP, LEIA-PRIMEIRO.txt, APLICAR-NO-SQL-EDITOR.txt ou o patch.
5. Confira que os caminhos começam em `src/`, `docs/` e `tests/`, sem uma pasta extra acima. Commit: **Adiciona interessados e visitas aos imóveis**.
6. Abra a PR para main: **FLUXA Imobiliária: interessados e visitas**. Descrição sugerida: “Vincula clientes interessados aos imóveis e permite agendar, reagendar e finalizar visitas com responsável e resultado. Inclui permissões por empresa, validação de vínculos, bloqueio de sobreposição e proteção de edição por versão. SQL operacional em docs/operations/real-estate-activity.sql.”
7. Aguarde os checks. Se houver erro, não faça merge: envie a mensagem do check. Quando aprovados, faça o merge.
8. No **Lovable do projeto principal**, abra **Cloud → Database → SQL Editor**, o mesmo banco em que a V1 foi aplicada. Abra localmente **APLICAR-NO-SQL-EDITOR.txt**, copie TODO o conteúdo e execute em uma consulta nova. Essa cópia é idêntica a `docs/operations/real-estate-activity.sql`. Resultado esperado: Query succeeded; No rows returned. Não substitua por SQL do Supabase novo da migração.
9. Abra `docs/operations/real-estate-activity-verify.sql` no pacote, copie e execute em outra consulta. Deve retornar duas linhas (`real_estate_interests`, `real_estate_visits`), com:

| Coluna                | Esperado        |
| --------------------- | --------------- |
| rls                   | true            |
| politicas             | 3 em cada linha |
| anon_pode_ler         | false           |
| usuario_pode_excluir  | false           |
| gravacao_respeita_rls | true            |
| anon_pode_gravar      | false           |

10. Publique no Lovable quando o código atualizado estiver sincronizado. No FLUXA, pressione **Ctrl + F5**. Abra a empresa de teste **Imobiliária Teste FLUXA → Imóveis**. O cartão deve apresentar **Interessados e visitas**.

Se o SQL apresentar erro, pare nesse ponto e envie apenas o erro. Não é necessário reenviar segredos ou dados dos clientes. A instalação é uma transação; uma falha reverte o bloco. Se a sessão ficar em uma transação abortada, execute `ROLLBACK;` em uma nova consulta antes de repetir. O SQL pode ser reaplicado e preserva registros existentes.

## Testes em uma sequência

Use apenas a empresa de teste. Os imóveis IMOV-001 e IMOV-002 podem continuar como estão: casa reservada, apartamento disponível.

1. Em **Clientes**, cadastre **Comprador Teste FLUXA** e **Locatário Teste FLUXA**. Preencha eventuais dados pessoais obrigatórios diretamente no sistema; não envie CPF, telefone ou WhatsApp no chat.
2. Abra **IMOV-001 → Interessados e visitas → Novo interessado**:
   - Cliente: Comprador Teste FLUXA.
   - Finalidade: Compra.
   - Situação: Novo.
   - Responsável: seu usuário, se listado.
   - Observações: Interesse fictício para homologação.
     Salve, clique em **Ver cliente** e confirme a ficha correta. Volte ao imóvel.
3. Reabra o painel. Edite o interessado para **Em contato** e salve. Pressione F5, abra novamente e confira que a alteração permaneceu.
4. Nesse interessado, clique em **Agendar visita**. Escolha **amanhã**, início **14:00**, fim **15:00**, responsável seu usuário, situação Agendada, observações Visita fictícia de teste. Salve e abra a aba **Visitas**. Confira cliente, data, horários e responsável. Os horários usam o fuso do seu aparelho.
5. Volte a Interessados e tente agendar outra visita com esse responsável, amanhã **14:30–15:30**. Deve aparecer conflito de horário; não deve criar a visita. Cancele o formulário.
6. Na aba Visitas, edite a primeira visita para amanhã **16:00–17:00** e salve. Confira a alteração após F5.
7. Edite a visita, selecione **Cancelada**, preencha Resultado/motivo: **Cliente solicitou reagendamento**. Salve e filtre por Cancelada: deve mostrar a visita e o motivo. Limpe o filtro.
8. Para testar conclusão sem esperar até amanhã: no mesmo interessado, crie uma visita com situação **Realizada**, início de **ontem às 14:00**, fim **15:00**, mesmo responsável e resultado **Cliente gostou do imóvel — teste fictício**. Salve. O filtro Realizada deve mostrar esse registro. A visita cancelada anterior deve continuar preservada.
9. No IMOV-002, registre Locatário Teste FLUXA com finalidade Locação e situação Novo. Agende uma visita futura. Confira que esse interessado e essa visita aparecem apenas no apartamento, não na casa.
10. Na casa, tente criar novamente Comprador Teste FLUXA + Compra. Deve avisar que já existe. Não deve aumentar a quantidade. Cancele o formulário.
11. Abra a edição do mesmo interessado em duas abas, sem atualizar entre elas. Na aba A, mude observações e salve. Na aba B, tente salvar outra observação: deve avisar que o registro mudou. Atualize B e abra novamente; deve mostrar a alteração de A.
12. No Android, confira o botão, as duas abas, filtros e rolagem até Salvar. Abra um formulário e cancele sem mudar os dados.
13. Se já houver usuário de leitura e outra empresa imobiliária de teste: o primeiro deve consultar sem botões de escrita; a segunda não deve ver os registros desta empresa. Se não houver, marque esses testes como pendentes. Não precisa convidar alguém apenas para testar agora.
14. Confira em Saúde e Jurídico: o painel imobiliário deve continuar restrito à área Imobiliária. Faça uma verificação rápida de que as telas já usadas continuam abrindo.

Informe tudo de uma vez: **cadastro, edição, visitas, horários, cancelamento, resultado, filtros e celular: OK**, ou quais itens falharam/ficaram pendentes. Não é necessário mandar imagem de cada clique.

## Reversão sem apagar dados

Se ocorrer um problema, reverta a PR de frontend pelo GitHub e publique a versão anterior. O botão novo desaparece, mas os dados de interessados e visitas permanecem no banco para correção posterior. Não apague tabelas. Não desative todo o módulo Imobiliária, pois isso também esconderia o cadastro de imóveis da V1.

## Notas técnicas e validação

RPCs públicos são SECURITY INVOKER com search_path fixo; permissões usam auth.uid, vínculo ativo e papéis da empresa, sem user_metadata ou chave privilegiada no cliente. Leitura para os oito perfis internos já usados pela V1; escrita para superadmin/proprietario/administrador/gestor/operacional. Cliente externo e anon não acessam. DELETE não é concedido. FKs compostas preservam empresa/imóvel/interessado. Vínculos de identidade de uma ficha não mudam durante edição; crie outra ficha se for outro cliente/finalidade.

O único SECURITY DEFINER novo é um trigger privado de auditoria com search_path fixo, autenticação obrigatória, sem execução direta por anon/authenticated. A auditoria guarda identificadores, situação e versão; não duplica notas ou resultado com dados pessoais.

O bloqueio de agenda considera somente visitas Agendadas da mesma empresa e responsável. Não consulta calendário externo, tarefas ou agenda de saúde. Usa advisory lock transacional por empresa/responsável e índice parcial para sobreposição; duas pessoas responsáveis diferentes podem visitar no mesmo horário. Não bloqueia duas visitas no mesmo imóvel com responsáveis diferentes. A verificação local de conflito foi sequencial; não houve ensaio de carga com conexões concorrentes no banco operacional.

O SQL fica em docs/operations como aplicação manual, como a V1. Não cria uma entrada na história de migrations do Supabase. Antes de automatizar deploy de schema, reconcilie estes blocos com a história existente usando a CLI, sem executar db push cegamente. Não foi acessada nenhuma conta e não foram rodados advisors no ambiente remoto.

Validações locais: TypeScript, ESLint e build; suíte completa com 1.229 testes aprovados (metadados Git temporários locais, sem remote, para o teste que enumera arquivos; nenhuma conta acessada); formulários e conversão de datas; banco PostgreSQL em PGlite 0.5.8 com SET ROLE authenticated, RLS, vínculos entre empresas, repetição de criação, duplicidade, reagendamento, conflito entre imóveis, resultado obrigatório, finalização de histórico, edição por versão, perfis, área/módulo, filtros, paginação, auditoria, privilégios e reaplicação. O SQL de conferência também foi executado nesse banco de teste. A aceitação no ambiente publicado depende dos testes acima.

O teste de banco está em `tests/real-estate-activity.database.mjs`. Desenvolvedores podem instalar @electric-sql/pglite@0.5.8 em uma pasta temporária fora do projeto e apontar FLUXA_PGLITE_ROOT para essa pasta ao executar o teste. Não foi adicionada dependência ao package.json do FLUXA.
