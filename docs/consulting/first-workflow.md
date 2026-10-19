# Consultoria e Serviços — primeiro fluxo

A área organiza os recursos existentes em Visão do dia, Clientes, Atendimentos,
Propostas, Projetos e entregas, Agenda, Tarefas, Documentos e Financeiro. Relatórios
continua disponível em Administração. Os atalhos recebem a mesma filtragem por
papel e módulos dos destinos originais; não concedem novas permissões.

A entrada inicial usa o perfil geral `consulting`. Especializações já salvas são
preservadas e continuam configuráveis depois do cadastro.

## Fluxo da empresa

1. Cadastre a pessoa ou empresa em Clientes.
2. Registre a necessidade e o acompanhamento em Atendimentos (Comunicação).
3. Abra Propostas, que utiliza o espaço comercial de Relatórios.
4. Após o aceite de uma proposta que tenha cliente vinculado, use “Novo projeto
   para este cliente”. O formulário existente recebe apenas o cliente; o usuário
   define título, escopo, valor, prazo e confirma o cadastro. O atalho não cria
   projeto, vínculo persistente com a proposta nem cobrança automaticamente.
5. Acompanhe o trabalho em Projetos e entregas, Tarefas e Documentos. Agenda é a
   visão gerencial existente; colaboradores sem acesso a Relatórios usam Tarefas.

As etapas apresentam termos de consultoria apenas nessa área. Os códigos, tons,
regras de automação e dados anteriores permanecem os mesmos. Movimentações novas
usam os nomes de consultoria no texto; o histórico anterior não é reescrito.

## Demonstração pública

`/demo?area=consulting_services` usa somente dados fictícios em memória, com
referência fixa em 18/10/2026, em português, inglês e espanhol. Permite preparar
proposta, simular envio/aceite, iniciar projeto de exemplo, marcar entregas e
avançar até a conclusão. A simulação impede projetos duplicados e exige as
entregas antes da conclusão. Esse encadeamento de exemplo não representa uma nova
integração automática no sistema autenticado. Recarregar ou reiniciar restaura
os exemplos. Não envia mensagens, não aceita contratos nem gera cobranças reais.

O menu e os cartões se adaptam a telas pequenas, com botões de pelo menos 44 px.
Não há migração SQL neste lote. Depois da integração, publicar pelo Lovable.

## Validação

Testes de navegação e permissões, seleção da aba por URL, projeção das etapas,
entrada/retomada do cadastro, fluxo completo e isolamento da demonstração, além
da renderização dos componentes reais em PT/EN/ES. `TZ=UTC npm run check` executa
tipos, lint, testes e build. CI e Supabase Final Validation são obrigatórios
antes do merge.

## Ficha do projeto e entregas

O segundo lote disponibiliza uma ficha editável para a consultoria. “Objetivo /
nome do projeto” usa `processes.title` e “Escopo combinado” usa `description`;
responsável e prazo usam os campos existentes. Não é criado um campo separado
para objetivo nem se convertem descrições antigas em texto estruturado. Clientes,
valores e contratos não são alterados pela edição da ficha.

A aba Entregas reaproveita `process_checklist_items`, mantendo os itens anteriores.
Cada entrega pode ter título, descrição/critérios, responsável por nome, data,
obrigatoriedade e situação. Os códigos existentes são apresentados assim:
`pendente` = Planejada, `recebido` = Entregue, `em_analise` = Em validação,
`aprovado` = Concluída e `rejeitado` = Ajustes solicitados. Somente `aprovado` conta
como concluído no progresso de consultoria. A marcação é interna, sem representar
aceite do cliente. Não muda automaticamente a etapa do projeto ou o financeiro.

Apenas editores podem alterar a ficha e as entregas; projetos arquivados ficam em
leitura. Operações continuam submetidas às políticas existentes do banco. Updates
confirmam uma linha retornada, evitando sucesso silencioso sem permissão. A edição
de entrega também restringe o ID ao projeto, organização e item não excluído.
A ficha atualiza caches de listas, cliente, busca e relatórios. Ficha e histórico
são operações separadas, conforme os hooks existentes; não se cria transação RPC.

A demonstração usa os mesmos componentes de apresentação, com edições locais e
reinício completo. Em Projetos e entregas, “Abrir ficha do projeto” abre os detalhes;
nenhuma edição atinge banco ou envia notificações. Textos de PT/EN/ES estão incluídos.
A simulação continua impedindo conclusão com entregas pendentes; essa restrição é
uma regra da demonstração, não um novo bloqueio no fluxo de etapas da empresa.

Validação adicional: persistência dos campos existentes e permissões de leitura /
escrita em PGlite com DDL e políticas originais (`consulting-project.database.mjs`),
além de datas civis, limites, progresso e edição/reinício da demo. Sem SQL novo.
