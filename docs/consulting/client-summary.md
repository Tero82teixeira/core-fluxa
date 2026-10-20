# Resumo da consultoria para o cliente

Na ficha de um projeto de Consultoria, abra **Ver resumo para o cliente**. A mesma
visualização está em **Projetos e entregas** na demonstração pública de Consultoria.

O resumo reúne empresa, cliente, referência, etapa, objetivo, escopo combinado,
responsável, prazo, acompanhamento agendado do plano ativo e entregas. Pendências
aparecem primeiro, ordenadas por prazo, deixando as sem data por último. Apenas
entregas com status `aprovado` contam como concluídas, conforme o progresso existente.
O acompanhamento vencido ou previsto para hoje pede conferência; não indica que uma
mensagem foi enviada. Planos pausados ou encerrados não apresentam acompanhamento ativo.

Revise o conteúdo e clique em **Baixar resumo em PDF**. O arquivo A4 é gerado
localmente, com fonte incorporada para os acentos em português, inglês e espanhol,
quebra de texto e paginação automática. O botão carrega o gerador e a fonte somente
quando solicitado. A prévia e o PDF usam a mesma estrutura traduzida e mostram a
data da posição em America/Sao_Paulo. Na demonstração, ambos identificam os dados
fictícios e a data fixa de referência.

O arquivo contém os campos acima, sem notas internas, descrições/critérios de
entregas, documentos pessoais, tarefas internas, financeiro, histórico ou anexos.
Objetivo e escopo são os textos cadastrados pela equipe: revise-os antes do envio.
As entregas concluídas representam registros da equipe, sem constituir aceite formal
do cliente. Este fluxo apenas baixa o arquivo; o envio ao cliente é feito pela equipe.

Leituras usam as permissões e os hooks existentes do projeto, checklist e plano
mensal. Erros de leitura impedem a prévia e o download, com opção de tentar novamente.
Não há link público novo, upload, alteração de status, cobrança, mensagem ou escrita
no banco ao abrir/baixar. Não exige SQL adicional.

Validação: testes do modelo verificam ordenação, status, campos permitidos, ausência
de mutações e estados vazios; renderização real em PT/EN/ES verifica texto escapado,
conteúdo atualizado da demonstração e identificação de exemplo. O gerador de PDF é
exercitado com texto extenso, fonte Unicode e várias páginas; amostras A4 renderizadas
e extraídas com Poppler verificam visual e integridade dos textos.

Fonte DejaVu Sans incluída com sua licença em `src/assets/DejaVuSans-LICENSE.txt`.
