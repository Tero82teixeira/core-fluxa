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
