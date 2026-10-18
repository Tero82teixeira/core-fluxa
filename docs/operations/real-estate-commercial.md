# Painel comercial da imobiliária

Aplicar `real-estate-commercial.sql` no banco operacional após atendimento manual e publicar pelo Lovable → Publish → Update. O SQL operacional é idêntico à migração versionada e pode ser reaplicado. Não altera atendimentos, permissões ou situações de negócios. Acrescenta um índice de empresa/data, um filtro privado e um RPC de leitura.

Em **Imobiliária → Painel comercial**, selecionar datas e responsável atual, depois **Aplicar filtros**. Padrão: últimos trinta dias, incluindo hoje; máximo: 366 dias. Os dias são inclusivos no fuso exibido. A seleção é de atendimentos recebidos no período (`created_at`), e os indicadores representam sua situação atual, não eventos que ocorreram nesse período. O responsável é o atribuído atualmente, inclusive histórico de usuários que já não estão ativos. Sem responsável pode incluir atendimentos encerrados; o indicador Em aberto sem responsável conta apenas os abertos.

Indicadores: contatos recebidos, aguardando atendimento (`novo`), em aberto, retorno atrasado, em aberto sem responsável, negócios informados e encerrados. São contagens de atendimentos, e não pessoas únicas; os indicadores podem se sobrepor. Negócios informados são encerramentos atuais com motivo Fechou negócio; não são comprovação de contrato, receita ou pagamento. Reabrir altera os indicadores atuais, mas preserva o histórico do atendimento.

Os resultados por canal exibem recebidos, em aberto, encerrados e os motivos dos encerramentos. Sem motivo registrado inclui registros antigos encerrados antes de esse campo existir. Não há taxa de conversão presumida. Canais sem registros mostram zero.

Cada número abre a fila com os mesmos limites de data/fuso, responsável, indicador, canal e motivo. Um aviso identifica o filtro aplicado e permite removê-lo. Busca, situação, somente meus e retornos podem restringir ainda mais essa fila. Agenda é a agenda geral existente, independente do filtro comercial. Criar um atendimento manual pela fila remove o filtro do painel e busca o contato criado, para não ocultá-lo por um período anterior.

Indicadores e fila usam `fluxa_inquiry_private.commercial_scope`, com RLS e autorização interna. Perfil com leitura da imobiliária, incluindo visualizador, pode consultar; cliente externo e anônimo não. As duas funções usam SECURITY INVOKER e search_path vazio. O limite de datas e a paginação de vinte registros valem também no servidor. O endpoint não grava dados e a consulta de responsáveis fica restrita à empresa.

Demonstração: nova seção Painel comercial com cinco contatos fictícios de canais diferentes, no cenário fixo de 16/10/2026. Usa os mesmos registros da fila e as ações já disponíveis: cadastro manual, atribuição, retorno, encerramento e reabertura atualizam os números. O filtro abre a fila correspondente sem apagar contatos que ficaram fora da seleção. Filtros e dados são apenas memória; recarregar ou reiniciar restaura os exemplos. As demais melhorias imobiliárias recentes permanecem na demonstração.

Validações: PGlite para contagens/atalhos, limite de dia no fuso local versus UTC, período máximo, responsável, motivos antigos, paginação e isolamento; pgTAP de privilégios/índice/ausência de elevação; testes dos indicadores da demo, atualização pelas ações e renderização real do painel em português, inglês e espanhol; tipos, lint, testes e build.
