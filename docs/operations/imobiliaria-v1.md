# FLUXA Imobiliária — imóveis V1

## Entrega

Cadastro, detalhes e edição de imóveis, proprietário vinculado a Clientes, responsável da equipe, endereço, finalidade, valores de venda/aluguel, área e observações. Busca por código, título, cidade, logradouro e proprietário; filtros de tipo, finalidade, situação e cidade; páginas de 20 itens. Venda/locação nos filtros também encontra imóveis com as duas finalidades. Indicadores acompanham os filtros.

Tipos: casa, apartamento, terreno, comercial, rural e outro. Situações: disponível, reservado, vendido, alugado e inativo. Esta etapa registra a situação administrativa: marcar vendido ou alugado não gera contrato, cobrança, comissão ou movimentação financeira. Fotos, visitas, interessados, propostas, contratos, vistorias e repasses são etapas posteriores.

A área Imobiliária já existia na escolha do segmento. O pacote libera o módulo Recursos Imobiliários e o menu Imóveis. Saúde e Jurídico mantêm suas rotas e telas. Nenhuma organização é convertida para Imobiliária pelo SQL.

## Ordem completa de instalação — você executa os cliques

### 1. Banco

Use o SQL Editor do mesmo projeto operacional do Lovable Cloud onde aplicou a correção das contas médicas. Não use o novo Supabase dysjefzfcbpxtzvjkwyi sem confirmar que ele passou a ser o banco operacional.

1. Descompacte o pacote no Windows.
2. Abra `docs/operations/real-estate-foundation.sql` com o Bloco de Notas.
3. Ctrl+A e Ctrl+C. No SQL Editor, abra uma nova consulta, cole o conteúdo inteiro e execute uma vez.
4. O esperado é Query succeeded / No rows returned. Se houver erro, pare e envie apenas o erro, sem credenciais.
5. Em nova consulta, execute o conteúdo completo de `docs/operations/real-estate-verify.sql`.
6. A única linha deve mostrar a tabela real_estate_properties, RLS true, 3 políticas, salvamento_respeita_rls true e os três últimos campos false. Se diferente, pare antes da publicação.

O script usa transação, pode ser reaplicado e não apaga dados existentes. Requer as tabelas organizations, organization_settings (com business_segment e enabled_modules jsonb), clients (com chave única organization_id/id), organization_members, profiles, audit_logs e a função has_org_role/app_role já existentes.

### 2. GitHub

1. Abra https://github.com/Tero82teixeira/core-fluxa.
2. Selecione main e crie a branch `imobiliaria-imoveis-v1` a partir dela.
3. Add file → Upload files.
4. Arraste SOMENTE as pastas `src`, `tests` e `docs` do pacote. São 12 arquivos de código, testes e operação. Os caminhos devem começar diretamente por src/, tests/ e docs/, sem uma pasta extra acima.
5. Não envie o ZIP, LEIA-PRIMEIRO.txt ou imobiliaria-v1.patch ao repositório.
6. Commit: `Adiciona cadastro de imóveis ao FLUXA Imobiliária`.
7. Compare & pull request. Base main; compare imobiliaria-imoveis-v1.
8. Título: `FLUXA Imobiliária: cadastro e gestão de imóveis`.
9. Descrição sugerida:

   Adiciona cadastro, detalhes e edição de imóveis com proprietário, responsável, finalidade, valores e situação. Inclui busca, filtros, paginação e acesso por empresa e papel. Mantém as áreas Saúde e Jurídico. SQL de instalação manual incluído em docs/operations; registrar se já foi aplicado. Falta validar a interface publicada com dados fictícios.

10. Confira Files changed: somente os 12 arquivos descritos no fim deste documento. Se um arquivo compartilhado tiver sido alterado na main depois do ZIP enviado em 07/10, não substitua a alteração recente sem revisão do diff.
11. Aguarde as verificações obrigatórias. Faça o merge somente se aprovadas e sem conflitos. Se falharem, envie o nome do teste e o erro; não ignore bloqueios.

### 3. Publicação

1. Abra o projeto principal no Lovable.
2. Aguarde a sincronização da main depois do merge.
3. Publish → Update, conforme os botões disponíveis.
4. Abra o sistema publicado e atualize com Ctrl+F5.

### 4. Empresa de teste imobiliária

Use uma organização de teste do segmento Imobiliária. Não troque o segmento da empresa Saúde ou Jurídico que já usa para outros testes.

Se ainda não tiver uma organização imobiliária de teste, saia do sistema, use Testar grátis e crie uma conta de teste com um endereço de e-mail seu que consiga confirmar. Faça a confirmação e escolha Imobiliária no cadastro da empresa. Não envie e-mail de acesso, senha ou tokens no chat.

Na organização imobiliária, vá a Configurações → Segmento e módulos. Confirme segmento Imobiliária, escolha o subtipo que descreve a empresa (por exemplo Imobiliária e corretagem) e ative Recursos Imobiliários caso não esteja ativo. Clique em Salvar segmento e módulos. Não desative os módulos que pretende usar. O menu Imóveis deve aparecer; ao concluir o cadastro, a página inicial dessa área passa a ser Imóveis quando o módulo está ligado.

## Teste completo em lote — responder só ao terminar

Use somente dados fictícios e a organização de teste.

1. Em Clientes, crie uma pessoa física chamada **Proprietário Teste Imobiliária**. Preencha apenas os campos obrigatórios com dados de teste válidos. Não use documento ou contato de uma pessoa real sem necessidade.
2. Em Imóveis → Novo imóvel, cadastre:
   - Código: IMOV-001
   - Título: Casa teste — venda
   - Tipo: Casa
   - Finalidade: Venda
   - Situação: Disponível
   - Proprietário: Proprietário Teste Imobiliária
   - Responsável: seu usuário, se aparecer; ou Não atribuído
   - Logradouro: Rua de Teste
   - Número: 100
   - Bairro: Centro
   - Cidade: Anchieta
   - Estado: ES
   - Valor de venda: 250000,00 (sem ponto de milhar)
   - Área: 90
   - Observações: Registro fictício para homologação
   - CEP e complemento podem ficar vazios.
3. Salve, abra Ver detalhes e confira os campos. Use Ver proprietário: deve abrir o mesmo cliente, sem duplicar cadastro. Volte a Imóveis.
4. Cadastre outro imóvel: IMOV-002, Apartamento teste — locação, tipo Apartamento, finalidade Locação, disponível, mesmo proprietário, Rua de Teste 200, Vitória/ES, aluguel mensal 1500,00, área 60. Demais campos opcionais podem ficar vazios.
5. Sem filtros: 2 imóveis, 2 disponíveis, 0 reservados. Busca IMOV-001 encontra apenas a casa; apague a busca. Filtro Locação encontra apenas o apartamento. Filtro cidade Anchieta encontra apenas a casa. Limpe os filtros.
6. Edite IMOV-001, troque a situação para Reservado e salve. Atualize a página. Esperado: 2 imóveis, 1 disponível, 1 reservado. O valor e proprietário continuam iguais.
7. Tente cadastrar um terceiro imóvel válido com o mesmo código IMOV-001 e dados obrigatórios preenchidos. Deve aparecer mensagem de código duplicado e não aumentar a quantidade. Cancele o formulário após conferir.
8. Em um cadastro novo, tente deixar o proprietário ou o valor obrigatório vazio. O formulário deve impedir o salvamento. Valor zero/negativo ou formato 250.000,00 deve ser rejeitado. Cancele; não precisa criar mais imóveis.
9. Confira edição simultânea: abra Editar do IMOV-001 em duas abas. Na aba A, altere o título para Casa teste — atualizada e salve. Na aba B, altere para Casa teste — edição antiga e tente salvar. Deve avisar conflito, sem sobrescrever a aba A. Atualize B e confira o título salvo em A.
10. Saia e entre novamente. Os dois imóveis e a situação Reservado da casa devem permanecer.
11. No Android, confira filtros, Ver detalhes, abertura do proprietário e formulário de edição. Conteúdo deve ser legível e o formulário deve permitir rolagem até os botões. Cancele se não quiser alterar.
12. Se já tiver usuário de teste visualizador/atendimento/financeiro na mesma empresa, confirme leitura sem Novo imóvel/Editar. Proprietário, administrador, gestor e operacional podem cadastrar e editar. Não crie convites nem compartilhe acesso só para executar este passo; deixe pendente se faltar o usuário.
13. Entre na conta/organização Saúde e na Jurídica que já testou. Elas não devem ganhar o menu Imóveis. Contas médicas e telas jurídicas anteriores devem continuar disponíveis conforme seus módulos e papéis.
14. Se tiver uma segunda organização imobiliária com usuário distinto e sem vínculo com a primeira, confira que não vê os imóveis desta empresa. Se não tiver, deixe o teste de isolamento em produção pendente; a regra foi testada localmente.

Ao terminar, envie uma única mensagem: quais passos passaram, quais ficaram pendentes e os números de eventuais erros. Capturas só dos problemas são suficientes. Não compartilhar senhas, chaves, URLs de conexão ou dados reais de clientes.

## Permissões e integridade

- Leitura: membros ativos internos, somente com área Imobiliária e módulo ligado (ou módulos vazios, que seguem os recomendados).
- Escrita: superadmin, proprietário, administrador, gestor e operacional.
- Cliente externo e anon: sem leitura e sem escrita de imóveis.
- RLS nas tabelas; RPCs públicas SECURITY INVOKER; USING e WITH CHECK nas políticas de atualização. Sem DELETE para authenticated.
- Proprietário: FK composta empresa/cliente. Para criar ou mudar vínculo, cliente deve estar não arquivado na empresa.
- Responsável: FK composta empresa/usuário, vínculo ativo e papel de operação. Se o responsável for desativado depois, para editar o imóvel escolha outro responsável ou Não atribuído.
- Código normalizado em maiúsculas, único por empresa. Criação com ID reutilizado só é aceita se os dados normalizados forem os mesmos.
- Edição exige versão atual e incrementa a versão no servidor; uma edição antiga não substitui uma nova pela RPC.
- Auditoria automática de criação/edição em audit_logs. O único SECURITY DEFINER novo é o trigger de auditoria no schema privado fluxa_real_estate_private, com search_path vazio e sem execução pública; não existe RPC privilegiada de edição.
- Não cria nova automação, cron, integração externa ou cobrança.

## Validação técnica local

TypeScript, ESLint e build aprovados. Quatro testes novos de formulário/acesso aprovados. Suíte geral comparada à cópia anterior: 1222 testes, 1221 aprovados, uma falha já presente na base (edge-functions-secrets-stage17.test.js exige git ls-files e o ZIP não contém .git). Base: 1218 testes, 1217 aprovados, a mesma falha. Nenhuma falha nova persistiu. O teste de navegação foi atualizado para incluir o menu Imóveis, preservando os demais itens.

SQL executado em PostgreSQL local via PGlite 0.5.8: RLS com SET ROLE authenticated (não apenas inspeção de texto), criação, edição, repetição idempotente, código duplicado, proprietário de outra empresa, responsável sem papel permitido, valores inválidos, estado/CEP, filtros e busca literal, paginação, conflito de versão, perfis visualizador/externo, área e módulo, auditoria, privilégio de exclusão e reaplicação preservando dados. O ambiente usa fixtures de autenticação e das tabelas existentes; não substitui validação no Supabase operacional. Concorrência de versões foi simulada sequencialmente, não medida com conexões paralelas.

Para reproduzir testes de código: npm run typecheck, npm run lint, node --test tests/real-estate.test.js tests/navigation.test.js, npm run build. Para o SQL opcional, instale PGlite em diretório temporário separado (sem alterar dependências do projeto):

```bash
npm install --prefix /tmp/fluxa-sql-test --no-save --package-lock=false @electric-sql/pglite@0.5.8
FLUXA_PGLITE_ROOT=/tmp/fluxa-sql-test node tests/real-estate.database.mjs
```

### Histórico de migrations

A cópia recebida tem migrations datadas até 23/10/2026, posteriores ao dia da entrega. Este pacote fornece SQL manual de operação em docs/operations, não inventa nem renomeia migration para passar à frente desse histórico. O script depende da base atual de segmentos. Antes de integrar deploy automático de banco, registrar esta mudança no histórico via Supabase CLI e resolver a ordem existente em checkout controlado. Não usar db push indiscriminadamente no banco operacional.

## Reversão

Se a interface falhar, reverta a PR de Imobiliária no GitHub e publique a reversão. Mantenha a tabela e a auditoria; não apague imóveis para reverter código. É possível desativar Recursos Imobiliários na organização de teste para bloquear leitura/escrita da área sem apagar os cadastros. Não reaplicar um ZIP antigo completo e não reverter a PR das contas médicas.

## Arquivos do upload (12)

- src/lib/real-estate.ts
- src/lib/organization-segments.ts
- src/lib/navigation.ts
- src/hooks/use-real-estate.ts
- src/routes/_authenticated/imobiliaria.imoveis.tsx
- src/routeTree.gen.ts (gerado pelo TanStack Router durante o build)
- tests/real-estate.test.js
- tests/navigation.test.js
- tests/real-estate.database.mjs
- docs/operations/real-estate-foundation.sql
- docs/operations/real-estate-verify.sql
- docs/operations/imobiliaria-v1.md

Fonte: ZIP enviado em 07/10/2026 mais a correção de contas médicas entregue e publicada pelo usuário na PR #291. O pacote contém somente alterações da Imobiliária, sem .env, secrets, node_modules ou arquivo de backup do banco. Nenhuma alteração foi enviada ao GitHub nem aplicada a uma conta pelo assistente.
