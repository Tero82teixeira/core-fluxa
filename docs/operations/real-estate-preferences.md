# Preferências e seleção personalizada

Aplicar `real-estate-preferences.sql` no banco operacional, após catálogo, atendimento e retornos. Publicar pelo Lovable após a integração. A migração versionada é idêntica ao SQL operacional e pode ser reaplicada sem apagar registros.

Em **Imobiliária → Atendimento e visitas → Fila de atendimento**, abrir **Preferências e imóveis compatíveis**. Salvar compra/aluguel, tipo, até dez bairros, orçamento, quartos e vagas mínimos. As preferências pertencem ao pedido, sem unir pessoas por nome ou telefone. Visualizadores podem consultar e compartilhar; os mesmos perfis que editam imóveis podem salvar.

A busca considera todo o catálogo publicado da empresa, com paginação de vinte opções. Exige igualdade da finalidade (aceita venda e locação), tipo e nome completo de um dos bairros, desconsiderando maiúsculas e acentos comuns do português. Orçamento, quartos e vagas incluem o limite exato; dados ausentes não comprovam compatibilidade. Aluguel considera apenas valor mensal, sem encargos. Desmarcar **Mostrar somente os compatíveis** exibe as divergências e permite selecionar alternativas manualmente. Resultados seguem os critérios salvos, mesmo enquanto se edita o formulário.

Selecionar até vinte anúncios entre páginas e gerar o link. O servidor revalida organização, publicação e disponibilidade no momento da geração. Imóvel indisponível, rascunho ou vitrine desativada impedem o compartilhamento. O link contém apenas token público e IDs dos anúncios; não carrega nome, telefone ou preferências. Copiar, visualizar como cliente ou abrir WhatsApp para revisar e enviar manualmente. O endereço abre fotos, valores e dados públicos existentes; anúncios retirados da vitrine também desaparecem dos links antigos. Não há relatório de envio automático nem confirmação de entrega.

Na demonstração, abrir **Atendimento e visitas**, depois as preferências de um pedido fictício. O mesmo formulário e critérios trabalham em memória, sem acesso ao banco. O link compartilha apenas a seleção dos exemplos originais; edições temporárias não seguem no link.

Validação: cenários PGlite de persistência, conflitos de versão, compatibilidade, valores ausentes, bairro, paginação, disponibilidade e isolamento; pgTAP de privilégios/RLS; testes unitários dos critérios e dos links; tipos, lint e build. As tabelas privadas usam RLS e a função pública executa como chamador, sem novo `SECURITY DEFINER`.
