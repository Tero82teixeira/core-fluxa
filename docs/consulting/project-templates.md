# Modelos de projetos de Consultoria

Em **Projetos e entregas → Novo projeto**, a seção **Começar com um modelo** oferece
Assessoria empresarial, Diagnóstico de processos e Plano de ação. Cada modelo traz
objetivo, escopo, etapa inicial `novo` (Diagnóstico, já existente) e quatro entregas
ordenadas. A prévia não altera o rascunho; somente **Usar este modelo** o preenche.

Se já houver objetivo, escopo, etapa diferente ou entregas, uma confirmação na tela
é exigida para substituir esses campos. Aplicar preserva cliente, responsável,
prazo, prioridade, tipo de serviço e valor do projeto. Depois de aplicar, tudo
continua editável. Não altera projetos existentes nem cria tipos de serviço.

## Entregas antes de salvar

A lista **Entregas iniciais** permite renomear, remover e adicionar até 20 títulos
de 3 a 160 caracteres, sem repetição de caixa/espaços. A lista vazia é válida para
um projeto manual. A seleção de um tipo de serviço preserva entregas que já estejam
no rascunho, em vez de substituir uma revisão manual ou um modelo aplicado.

As entregas são gravadas pelo fluxo existente de checklist em uma inserção em lote,
com posição conforme a lista e status `pendente` (Planejada). Não recebem prazo,
responsável ou critérios próprios automaticamente: a equipe os define pela ficha.
O prazo e o responsável do projeto não são copiados silenciosamente às entregas.

O bloqueio de envio cobre a criação do projeto e a gravação separada das entregas.
Se a segunda requisição falhar, o projeto confirmado é preservado, a equipe recebe
um aviso para conferir a ficha e a navegação abre esse projeto. O fluxo não repete
a criação nem tenta inserir novamente as entregas automaticamente. Uma resposta
perdida pode não confirmar a gravação; conferir evita repetição manual.

O aviso de alterações não salvas considera também a lista de entregas. Os modelos
não configuram valores, prazos, plano mensal ou recorrência e não criam cobranças.
Nenhuma migration, RPC, tabela ou dependência nova é necessária.

## Demonstração

Em **Projetos e entregas → Novo projeto com modelo**, o visitante pode escolher um
cliente fictício, aplicar e adaptar o modelo, revisar entregas e criar um projeto
local. A ficha abre em seguida, sem alterar propostas, planos, tarefas ou financeiro.
O valor aparece como não informado. Reiniciar a demonstração remove os projetos
adicionados e restaura os exemplos. Catálogo, seletor e editor são compartilhados
com o cadastro real, em português, inglês e espanhol.

## Validação

Testes do catálogo verificam três idiomas, limites, preservação de campos e ausência
de mutações. O orquestrador testa sucesso e falhas independentes de projeto/entregas.
Testes da demonstração verificam vínculo com o cliente, entregas planejadas, repetição
do mesmo identificador e ausência de efeitos em outros módulos. Renderização real
verifica prévia, confirmação, títulos escapados, mensagens e limites dos campos.
O teste de banco existente da ficha foi ampliado para inserir os três modelos com
as políticas reais de criação, reler os títulos/posições e conferir os valores padrão.
