# Projeto a partir da proposta aceita

O pacote conecta três partes: título sugerido, escopo aprovado e referência
persistente para consultar a proposta de origem.

Em **Propostas**, uma proposta aceita com cliente vinculado ou convertido oferece
**Preparar projeto desta proposta**. A URL leva somente o identificador da
proposta. O cadastro consulta os dados novamente na empresa ativa, confere aceite,
arquivamento e acesso ao cliente e só então abre a revisão. Não usa título,
escopo, preço ou datas recebidos pela URL.

O nome sugerido vem do título aprovado, limitado a 160 caracteres com aviso quando
houver redução; o título integral continua disponível para consulta. O escopo vem
de `service_description`. O cliente fica fixo no cliente da proposta (ou no cliente
convertido quando o aceite criou seu cadastro). Esse cliente é consultado pelo ID
na visão segura, sem depender dos primeiros 500 nomes do seletor geral.

A equipe pode adaptar nome e escopo, revisar responsável e prazo e adicionar,
renomear ou remover entregas antes de criar. O valor e as datas de pagamento da
proposta não são copiados, e nenhuma entrega é inferida do texto aprovado. O tipo
de serviço e os modelos continuam com suas sugestões existentes, mediante escolha
explícita; ao substituir um rascunho preenchido por um modelo, a confirmação
existente permanece. O responsável inicial segue o usuário/equipe como no cadastro
manual, e o prazo começa vazio. A referência identifica a origem, sem declarar que
alterações posteriores no projeto modificam o contrato aprovado.

## Referência permanente e acesso

A migration `20261021200209_consulting_project_proposal_source.sql` adiciona o campo
nullable `processes.source_commercial_proposal_id`, FK com exclusão restrita e um
índice parcial por empresa/proposta. Não preenche nem vincula projetos anteriores.
Não limita uma proposta a um único projeto no sistema real.

O trigger SECURITY INVOKER, com search_path vazio, mantém RLS e privilégios
existentes. Na criação com origem, exige sessão, papel editor, Consultoria e módulos
Projetos/Relatórios habilitados; confere proposta aceita e não arquivada, empresa
e cliente ativo correspondente. Perfis continuam submetidos às políticas de
INSERT de processos já existentes, sem ampliar permissões. Registros sem origem
mantêm o fluxo anterior, inclusive outras áreas e automações existentes.

A referência é gravada junto com a linha do projeto. Depois, não pode ser trocada,
adicionada por edição nem removida; também não permite trocar empresa ou cliente
de um projeto vinculado. Campos operacionais continuam editáveis, inclusive se a
proposta for arquivada depois. A FK impede exclusão física da proposta enquanto
houver projeto referenciando-a. O arquivamento não apaga a referência.

Na ficha do projeto, **Consultar proposta de origem** apresenta número, título,
serviço e condições aprovadas. A consulta exige acesso a Relatórios e empresa
ativa; usa campos permitidos, sem carregar token público, contatos, documentos,
valor ou datas de cobrança. Uma proposta arquivada continua consultável com aviso.
Se a leitura falhar, a ficha mantém o projeto e informa que a origem está
indisponível; não inventa conteúdo nem remove o vínculo.

A criação continua usando o hook de processos existente. Entregas são uma segunda
requisição em lote, com o tratamento de confirmação parcial já disponível; o
projeto confirmado não é recriado se a gravação das entregas falhar. Não se adiciona
uma RPC transacional, mecanismo de idempotência ou conversão financeira. Conferir a
ficha continua necessário se a resposta de criação não puder ser confirmada.

## Demonstração e ativação

Na demonstração de Consultoria, uma proposta aceita abre o mesmo formulário de
revisão compartilhado com os modelos. Somente o clique final cria o projeto local,
com nome, escopo, responsável, prazo e entregas revisados. A referência fica no
estado dessa sessão e aparece ao abrir a ficha. Repetir a confirmação do mesmo
projeto de exemplo não cria duplicado. Valores de pagamento não viram valor do
projeto e nenhum prazo financeiro é usado como prazo operacional. Reiniciar remove
os novos exemplos e restaura os dados fictícios. Textos de PT/EN/ES incluídos.

Aplicar a migration (cópia idêntica em
`docs/operations/consulting-project-proposal-source.sql`) no banco operacional
`nobtbymxudlcsyurbopl` antes de publicar no Lovable. O arquivo único de ativação pode
ser executado novamente sem apagar vínculos. Não aplicar ao banco auxiliar nem ao
projeto de Edge Functions. Não há novas dependências ou permissões de API.

## Validação

Regras verificam aceite/empresa/cliente convertido, redução do título e campos
permitidos. A demonstração verifica revisão explícita, entregas escolhidas,
referência preservada, repetição, reinício e ausência de alterações em tarefas,
planos e financeiro. Componentes reais em PT/EN/ES cobrem prévia, referência,
estados de erro/carregamento e texto escapado.

O teste de banco existente da ficha executa o SQL real duas vezes com as políticas
originais de processos e propostas. Cobre persistência, proposta não aceita,
arquivamento, cliente errado/convertido/inativo, outra empresa, módulo, área,
papéis, sessão, imutabilidade, exclusão restrita e edição posterior do projeto.
pgTAP e a paridade dos tipos gerados rodam na pipeline do banco completo.
