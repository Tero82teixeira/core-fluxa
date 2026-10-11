# FLUXA — Imobiliária: Propostas + Negociações

Pacote V3, preparado em 09/10/2026 sobre a base local de Interessados + Visitas já testada pelo usuário. Não acessa contas, não executa SQL remoto e não altera o GitHub automaticamente. A versão publicada deve ser validada pelo usuário.

## O que entrega

- Botão **Propostas e negociações** em cada imóvel; atalho **Nova proposta** em cada interessado.
- Proposta vinculada ao interessado e à finalidade (compra/locação), com valor, condições, validade, origem das condições e observação.
- Situações aberta, contraproposta, aceita, recusada e cancelada. Vencida é um indicador calculado, não uma alteração automática do histórico.
- Contraproposta e atualização das condições criam novas versões. Cada evento registra usuário, horário, valor, condições, validade e confirmação/motivo.
- Decisões preservam os termos da última versão. Aceite, recusa e cancelamento exigem justificativa ou confirmação.
- Uma proposta ativa por interessado/finalidade do imóvel. Proposta vencida deve ser renovada por atualização/contraproposta ou encerrada antes de outra proposta.
- Impede duas propostas aceitas para a mesma finalidade do imóvel. Imóvel venda/locação admite finalidades independentes.
- Aceite pode ser cancelado com motivo; o aceite permanece no histórico. Propostas recusadas/canceladas não reabrem: criar nova proposta.
- Validade inclui o dia indicado no fuso America/Sao_Paulo. Locação usa aluguel mensal, não o valor total do contrato.
- Filtros, paginação de 20 itens, histórico paginado, telas responsivas, erro com opção de tentar novamente.

## Instalação — faça esta sequência completa

Pré-requisito: pacotes Imobiliária V1 e Interessados + Visitas instalados no mesmo banco operacional. Não aplicar no Supabase novo sem confirmar que ele é a origem atual. Este pacote não migra o banco nem resolve a conexão externa do Lovable Cloud.

1. **Baixe e extraia o ZIP** no computador. Não envie o próprio ZIP ao GitHub. `upload/` contém somente os arquivos do pacote; `APLICAR-NO-SQL-EDITOR.txt` é a cópia do SQL; `propostas-negociacoes.patch` permite revisar o que mudou.
2. **GitHub → Tero82teixeira/core-fluxa**. Partindo da main atual, crie a branch `imobiliaria-propostas-negociacoes`. Em Add file → Upload files, envie as pastas `src`, `docs` e `tests` de dentro de `upload/`, mantendo os caminhos da raiz do repositório. Confirme com mensagem `feat: propostas e negociações imobiliárias`. Não crie uma pasta chamada upload no repositório. Se os dois arquivos existentes abaixo tiverem alterações posteriores ao último pacote, revise o patch antes de substituí-los.
3. **Lovable principal → Cloud → banco → SQL Editor**: copie todo `APLICAR-NO-SQL-EDITOR.txt`, cole e execute uma única vez. O SQL tem BEGIN/COMMIT: se houver erro, interrompa a publicação e guarde apenas a mensagem do erro. Não envie senha, conexão, token ou dados de clientes. `Query succeeded / No rows returned` indica que a aplicação do SQL terminou; ainda faltam os testes das telas.
4. **Confira o banco**: execute `upload/docs/operations/real-estate-proposals-verify.sql`. As duas tabelas devem mostrar `rls=true`, `politicas=2` e os quatro campos de permissões `false`. As quatro RPCs devem mostrar `security_definer=false` e `anon_pode_executar=false`.
5. **GitHub → Pull requests → New pull request**, base main, compare imobiliaria-propostas-negociacoes. Revise os arquivos e aguarde as verificações. Quando passarem, faça o merge. No Lovable conectado ao repositório, confirme que a mudança chegou e publique. Se a publicação não refletir o merge, confira a sincronização antes de reaplicar SQL.
6. **Execute os testes abaixo de uma vez**, na empresa Imobiliária Teste FLUXA, usando registros de teste. Só depois considere este pacote validado no sistema publicado.

Arquivos existentes alterados: `src/routes/_authenticated/imobiliaria.imoveis.tsx` e `src/components/real-estate/property-activity.tsx`. A fundação, os interessados e as visitas não são substituídos no banco. O pacote não muda saúde/advocacia, navegação global, planos, cobrança ou secrets.

## Testes na tela — pode fazer todos e informar o resultado junto

1. **Criar**: Imóveis → IMOV-001 disponível/reservado → Interessados e visitas → interessado já cadastrado → Nova proposta. Valor `240000,00`; condições `Entrada de R$ 50.000 e restante financiado. Sujeito à análise do financiamento.`; validade escolha 7 dias à frente; condições do Interessado. Registrar. Deve aparecer Aberta, versão 1. O mesmo fluxo também está no botão Propostas e negociações do imóvel.
2. **Contraproposta**: abrir negociação → Registrar contraproposta. Valor `245000,00`; condições `Entrada de R$ 60.000 e restante financiado.`; validade futura; condições do Proprietário; observação `Ajuste solicitado pelo proprietário.`. Deve aparecer Contraproposta e manter o valor de 240 mil na versão anterior do histórico.
3. **Aceitar**: Registrar aceite → confirmação `Aceite confirmado em teste, sem contrato real.` → Registrar. Deve aparecer Aceita com R$ 245 mil; valor/condições não podem ser editados nessa decisão. Imóvel não deve virar vendido e nenhuma cobrança deve ser gerada.
4. **Persistência e filtros**: pressione F5, reabra o imóvel e veja proposta aceita e histórico. Filtre por Aceita. Confira leitura no celular. No imóvel de locação, confira que o formulário informa aluguel mensal.
5. **Cancelar após aceite**: Cancelar negociação → motivo `Cancelamento de teste antes do contrato.`. Deve aparecer Cancelada, com aberta, contraproposta, aceite e cancelamento preservados. Não deve haver botão para apagar o histórico ou reabrir a proposta cancelada.
6. **Recusar**: crie outra proposta para o mesmo interessado após o cancelamento; valor positivo e validade futura. Abra → Recusar → motivo `Condições não aprovadas em teste.`. Deve aparecer Recusada e preservar a primeira versão.
7. **Campos inválidos**: tente valor vazio, zero, negativo e três casas decimais; condições vazias; validade passada; aceite/recusa/cancelamento sem motivo. Não devem salvar. A validade que vencer com o tempo aparece como Vencida; renove por Atualizar condições/Contraproposta antes do aceite.
8. **Conflito entre abas**: abra a mesma proposta aberta em duas abas. Na primeira, registre contraproposta. Na segunda, tente salvar uma ação baseada na versão antiga. Deve pedir atualização, sem substituir o que foi salvo. Volte à lista, Atualizar, reabra e confira.
9. **Aceite exclusivo**: se houver dois interessados de teste no mesmo imóvel/finalidade, abra uma proposta de cada e aceite a primeira. O aceite da segunda deve ser bloqueado. Cancele a primeira com motivo antes de aceitar a segunda. Não use interessados reais para este teste.
10. **Permissões**: quando houver usuário somente leitura disponível, ele deve consultar lista/histórico sem botões de alteração. Um usuário de outra empresa não deve conseguir ler essas propostas. Estes casos passaram localmente, mas precisam de validação com contas de teste no ambiente publicado.

Não envie dados privados ou secrets nas capturas. Informe os números dos testes que passaram e a mensagem de qualquer erro.

## Modelo e segurança

`real_estate_proposals` guarda os vínculos imutáveis; `real_estate_proposal_events` guarda o histórico. O estado atual é o último evento. Ambas usam RLS e vínculos compostos por empresa/imóvel/interessado. Usuários autenticados têm apenas SELECT/INSERT nas novas tabelas: sem UPDATE/DELETE. Leitura segue os oito perfis internos da imobiliária; escrita exige superadmin, proprietário, administrador, gestor ou operacional. Cliente externo e anônimo não têm acesso.

RPCs públicas são SECURITY INVOKER com search_path fixo e checagem do módulo/empresa. Triggers validam inclusive INSERT direto, atribuem usuário/horário, conferem sequência e termos, impedem transições inválidas. Eventos do imóvel usam advisory lock transacional para serializar verificações de versão e aceite. UUID do pedido evita duplicação em repetição idêntica; tentativa de reutilizar o mesmo UUID com payload diferente falha. Auditoria privada SECURITY DEFINER só registra metadados do evento, com execução direta revogada; sem valor/condições nos audit_logs.

A instalação é transacional e pode ser reaplicada sem apagar registros. Não há DROP TABLE/TRUNCATE nem alteração do histórico de migrations. SQL manual acompanha a convenção dos pacotes anteriores; não executar `supabase db push` como substituto dessa sequência. Também não adicionar este SQL a uma migration com data inventada sem reconciliar o histórico do projeto.

## Validação local e limites

Verificação de TypeScript, ESLint, suíte do projeto (1.233 testes), build e teste SQL em PostgreSQL embarcado PGlite. Os testes SQL exercitam RLS/usuários/empresas, valores, validade, decisões, histórico, conflitos de versão, repetição segura, aceite exclusivo, paginação e reaplicação. Não representam execução no banco operacional nem teste de carga com conexões concorrentes reais. Testes de interface deste pacote no sistema publicado ainda pendentes.

Para executar o teste SQL local, a dependência de teste PGlite deve estar disponível fora da aplicação; `FLUXA_PGLITE_ROOT` aponta para o diretório com package.json/node_modules. Não foi acrescentada dependência ao produto. Com isso configurado: `node tests/real-estate-proposals.database.mjs`. Os testes unitários rodam com `npm run test:run`.

Fora do escopo: assinatura/envio de propostas, PDF comercial, portal do interessado, contrato, comissão, reserva automática, integração financeira e avisos automáticos. São próximas evoluções separadas. O backup automático do banco continua pendente; este pacote não o ativa e não constitui um backup atualizado do banco.
