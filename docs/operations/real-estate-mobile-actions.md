# Consulta por voz e seleção de imóveis no início rápido

A tela rápida de celular/tablet aceita os seguintes comandos por voz ou no campo de consulta:

- `Quem preciso atender hoje?` abre as visitas e retornos atribuídos ao usuário no dia local do dispositivo.
- `Cliente Marina Costa` mantém a consulta de cliente: uma correspondência abre a ficha; mais de uma oferece seleção.
- `Apartamentos para alugar no Centro até dois mil reais` abre Imóveis com tipo, finalidade, localização e valor máximo. Os filtros entendidos ficam visíveis e podem ser ajustados.
- `Apartamentos no Centro até R$ 2 mil` exige escolher compra ou locação antes de consultar com esse orçamento.

Os comandos são atalhos de consulta com regras explícitas, não um agente que altera registros. A voz continua dependendo de navegador compatível, toque explícito e contexto seguro, com alternativa digitada, timeout e cancelamento ao ocultar/sair. Não se grava áudio nem transcrição no FLUXA. Buscas de cliente têm precedência quando o comando identifica explicitamente o cliente, mesmo que o nome contenha palavras como Casa ou Agenda.

## Seleção para o cliente

Em Imóveis, selecionar até 20 itens. A seleção permanece ao trocar filtros/páginas e oferece conferência de fotos, localização, valores, características e descrição pública. A conferência identifica imóveis sem anúncio disponível; estes precisam ser removidos ou publicados na versão completa antes de preparar o link. Imóveis vendidos/alugados/inativos não podem ser adicionados.

`Preparar link da seleção` faz nova conferência e compara os IDs dos anúncios com o resultado do catálogo público. Se algum anúncio deixou de estar disponível, não gera um link parcial nem transforma a seleção vazia em vitrine inteira. O URL contém somente token da vitrine e IDs públicos de anúncios, sem nome/telefone do cliente, notas internas ou IDs privados dos imóveis.

`Copiar` mantém o link disponível para cópia manual quando a área de transferência não permite acesso. `Compartilhar` chama a folha de compartilhamento do dispositivo quando disponível; na ausência/falha usa cópia. Cancelamento do compartilhamento nativo não copia nada. A validação assíncrona ocorre antes do botão Compartilhar, preservando o gesto exigido pelos navegadores. Nenhuma mensagem é enviada automaticamente. O usuário escolhe o aplicativo/destinatário e confirma o envio.

A troca/limpeza da seleção descarta o link preparado e encerra respostas antigas. A prévia renova fotos assinadas e visibilidade a cada minuto, com consultas somente para os itens escolhidos e concorrência máxima de quatro. O catálogo público continua verificando a disponibilidade quando o destinatário abre o link.

## Demonstração

Usa dados fictícios e fotos ilustrativas já existentes, sem banco. O apartamento IMOV-002, no Centro, tem aluguel de R$ 1.600 e duas fotos; IMOV-005 tem venda por R$ 390.000. Links produzidos abrem `/demo?area=real_estate&catalogo=...`, preservando a seleção. O IMOV-003 não tem anúncio demonstrativo na vitrine e não entra em link compartilhado. Os textos de compartilhamento identificam a demonstração. A versão completa no computador e os catálogos públicos existentes continuam disponíveis.

## Ativação e validação

Reutiliza `real_estate_mobile`, `search_real_estate_properties`, `real_estate_catalog_manage` (somente ação load) e `real_estate_public_catalog` já instaladas nos lotes anteriores. Não há SQL, migração, novas permissões nem alterações de dados neste lote. Publicar no Lovable com **Publish → Update** após a integração.

Validação: comandos PT/EN/ES, finalidade ambígua, orçamento e filtros, limite/concorrência/ordem de seleção, cancelamento/falha do compartilhamento, renderização real em três idiomas, escape de conteúdo, fotos de exemplo e PGlite com RPCs existentes para filtros antes da paginação, privilégios por papel/empresa, IDs de anúncio, projeção pública e despublicação concorrente. As verificações automáticas do repositório permanecem obrigatórias.

Reversão: publicar o código anterior. Os dados e as funções do banco não mudam.
