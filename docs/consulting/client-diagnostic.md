# Diagnóstico inicial da Consultoria

Em **Clientes → abrir cliente → Visão geral**, o cartão **Diagnóstico inicial**
registra área de melhoria (vendas, organização, atendimento, financeiro, processos
ou outra), situação atual, tentativas anteriores, resultado esperado, prioridade
e prazo desejado. Situação e resultado são obrigatórios, de 3 a 2.000 caracteres;
tentativas e prazo são opcionais. O prazo é uma referência, não uma promessa de
entrega, tarefa ou lembrete automático. Serve para pessoas e empresas.

A leitura começa pelo resumo. **Registrar diagnóstico** ou **Editar diagnóstico**
abre um único formulário, em uma coluna no celular e com botões de pelo menos
44 px. Salvar bloqueia os campos durante a requisição. O rascunho é preservado
quando a resposta falha; cancele a edição para conferir a versão persistida antes
de tentar outra vez. **Cancelar edição** descarta as alterações locais.

Há um diagnóstico atual por cliente. A revisão lida ao abrir a edição é mantida
mesmo com atualização em segundo plano. O banco serializa gravações pelo cliente,
recusa revisões antigas e grava a auditoria na mesma transação. Se outra pessoa
alterou, copie o que precisar do rascunho e cancele/abra a edição para revisar o
registro atual. O histórico geral registra a revisão, sem copiar as respostas.
Não há histórico completo das versões das respostas.

As respostas são internas: não entram no portal do cliente, no resumo em PDF,
nas propostas ou nos projetos automaticamente. A equipe consulta o diagnóstico
antes de preparar esses materiais. Não cria cliente, proposta, projeto, tarefa,
plano mensal, cobrança ou mensagem e não altera observações cadastrais.

## Acesso e ativação

Migration `20261021142356_consulting_client_diagnostics.sql`, com cópia idêntica em
`docs/operations/consulting-client-diagnostics.sql`. Aplicar no banco operacional
`nobtbymxudlcsyurbopl` antes de publicar pelo Lovable. O banco auxiliar e o projeto
de Edge Functions não devem receber esse SQL. O script não modifica as tabelas
existentes de clientes, projetos ou propostas; cria tabela privada e três funções.
É repetível sem apagar os diagnósticos já registrados.

A tabela tem RLS e nenhuma permissão direta para anon, authenticated ou service_role.
Somente as RPCs de leitura e gravação são executáveis por authenticated. Ambas
exigem sessão, vínculo ativo, área consulting_services e módulo clients habilitado
(lista de módulos vazia conserva a convenção do sistema de liberar todos).
Proprietário, administrador, gestor, operacional e superadmin podem editar;
visualizador pode ler; atendimento, financeiro e cliente externo não acessam.
O perfil operacional só consulta e edita clientes sob sua responsabilidade direta
ou vinculados a projeto/tarefa de sua responsabilidade, como na carteira existente.
Clientes arquivados continuam legíveis, mas não aceitam edição. Empresa e cliente
são conferidos no servidor em todas as chamadas; o helper de acesso é interno.

## Demonstração

Em `/demo?area=consulting_services → Clientes`, escolha um cliente fictício.
Aurora Tecnologia tem um diagnóstico de exemplo traduzido em PT/EN/ES; os demais
começam vazios. O mesmo cartão e formulário reais permitem editar ou registrar
respostas nesta sessão. Trocar de cliente mostra o diagnóstico correspondente.
**Reiniciar demonstração** restaura os exemplos. Nenhum dado é enviado ao banco.

## Validação

Testes de regras e demonstração verificam limites, datas civis, campos permitidos,
revisão local e ausência de efeitos nos outros módulos. Renderização dos componentes
reais verifica formulário, estados vazios/leitura, texto escapado e PT/EN/ES.
PGlite executa o SQL da migration duas vezes e verifica persistência, revisões
antigas, primeira gravação repetida, nove papéis, inatividade, módulo, área,
isolamento entre empresas/clientes, clientes arquivados, acesso direto negado,
sessão obrigatória e rollback quando a auditoria falha. pgTAP no banco completo
confere RLS, privilégios, funções e search_path; a validação de integração confere
paridade dos tipos gerados. Nenhuma validação foi feita com dados reais de clientes.
