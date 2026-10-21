# Proposta a partir do diagnóstico

Em **Clientes → abrir cliente → Visão geral → Diagnóstico inicial**, a ação
**Preparar proposta** usa o resultado esperado como ponto de partida do serviço.
É necessário um diagnóstico salvo. Durante sua edição, o atalho não aparece;
as alterações precisam ser salvas ou canceladas primeiro.

O título inicial é genérico e editável. A equipe revisa objetivo/escopo/entregas,
redige as condições comerciais e define valor, frequência de pagamento, primeiro
vencimento e validade. Valor, condições e datas começam vazios. O prazo desejado
do diagnóstico não é transferido para as datas financeiras. Situação atual,
tentativas anteriores, prioridade e observações internas não são copiados.
O nome e o vínculo do cliente vêm da ficha aberta; contatos e documentos não são
preenchidos automaticamente. O valor aceita vírgula ou ponto decimal, até duas
casas, sem separador de milhar. O formulário valida os limites já aceitos pela
rotina comercial e datas civis, sem substituí-las por datas calculadas. O dia
mínimo segue o formulário comercial existente e a validação da API; as datas
escolhidas são enviadas literalmente, sem conversão de fuso.

**Salvar rascunho** usa `useSaveCommercialProposal` e a RPC existente
`save_commercial_proposal`: não publica token, envia mensagem, cria cliente,
projeto, tarefa ou receita, e mantém `asaas_auto_charge=false`. O rascunho fica
em **Propostas**, onde pode ser editado e seu link gerado pela ação existente.
A geração do link e o eventual aceite seguem as regras comerciais já existentes.

A preparação só aparece para editores da Consultoria com o módulo Relatórios
habilitado, preservando as permissões do destino Propostas. A leitura do
próprio diagnóstico mantém sessão, empresa e restrição da carteira operacional.
Clientes arquivados ficam somente em leitura. Não muda permissões ou o contrato
das RPCs existentes. Não adiciona migration, tabela, coluna, dependência ou SQL
de ativação; basta publicar no Lovable, com o diagnóstico e as propostas já ativos.

## Confirmação de gravação

Abrir ou cancelar a preparação só altera o rascunho local. O envio do formulário
usa trava imediata contra cliques repetidos e desabilita os campos enquanto salva.
O retorno precisa confirmar um UUID. Falhas preservam o texto e bloqueiam nova
submissão nessa tela: a equipe deve abrir Propostas para conferir se houve
gravação antes de preparar outro rascunho. Não há repetição automática nem promessa
de idempotência da RPC de criação após perda de resposta. O formulário não busca
nem sobrescreve propostas já existentes para o mesmo cliente.

## Demonstração

Em `/demo?area=consulting_services → Clientes`, o mesmo botão e formulário usam
o resultado esperado do exemplo traduzido ou do diagnóstico editado nesta sessão.
Salvar cria um rascunho local para esse cliente; **Ver propostas** permite revisar
e editar esse rascunho antes de simular envio e aceite. Os textos revisados ficam
literais ao trocar idioma. Reiniciar a demonstração remove os novos rascunhos.

Os exemplos antigos de propostas continuam com o fluxo anterior. Em propostas
preparadas do diagnóstico, a simulação explícita de projeto após aceite usa o
objetivo e serviço revisados, sem transformar o primeiro vencimento em prazo do
projeto e sem inventar uma lista de entregas. A ficha permite definir prazo e
entregas depois. Nenhuma etapa da demonstração acessa o banco ou financeiro real.

## Validação

Regras testadas: conteúdo permitido, campos vazios iniciais, limites monetários,
centavos, datas civis, rascunho vinculado ao cliente e cobrança automática desativada.
O fluxo da demonstração verifica criação, repetição do mesmo ID, edição só em
rascunho, ausência de alterações no diagnóstico/atendimentos/planos/tarefas e
financeiro, além de separar datas financeiras do prazo do projeto.

Renderização dos componentes reais em PT/EN/ES verifica formulário, campos para
revisão, texto escapado, botões e exibição de rascunhos. O teste de banco do
diagnóstico foi ampliado com a migration original completa de propostas: salva e
edita pelo RPC real, confirma status draft e token público inacessível, recusa
cliente de outra empresa/arquivado e perfil de leitura, e confirma que cliente,
projeto, tarefas e financeiro não foram criados ou alterados por salvar o rascunho.
A pipeline existente já executa esse teste; não é criado outro ambiente de testes.
