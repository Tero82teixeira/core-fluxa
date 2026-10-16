# Vitrine pública da imobiliária

## Ativação

1. No SQL Editor do banco operacional já utilizado pelo FLUXA (`nobtbymxudlcsyurbopl`), execute `docs/operations/real-estate-catalog.sql` completo como postgres. As etapas imobiliárias anteriores devem estar instaladas nesse banco. O script também está versionado na migration `20261016193003_real_estate_public_catalog.sql` para ambientes com aplicação automática de migrations.
2. Publique a atualização no Lovable por **Publish → Update**.
3. Na área Imobiliária, abra **Vitrine e compartilhamento**, informe o nome público e o WhatsApp comercial com DDD, marque a ativação e salve.
4. No cartão de um imóvel, abra **Fotos e anúncio**. Revise o título, preencha a descrição pública e as características e salve o rascunho. Envie as fotos e, quando estiver pronto, marque **Publicar este anúncio na vitrine** e salve.

Nenhum imóvel existente é publicado automaticamente. O nome público e o contato precisam ser confirmados pela imobiliária. Quartos, banheiros, vagas e diferenciais são preenchidos na edição do anúncio. Tipo, valores, metragem, bairro, cidade e estado acompanham o cadastro interno do imóvel.

## Apresentação e compartilhamento

- A vitrine completa usa `/imoveis/<token>` e permite filtrar por compra/locação, tipo, valor máximo, bairro, cidade ou código.
- Em **Vitrine e compartilhamento**, selecione até 20 anúncios visíveis e copie a seleção ou abra o compositor do WhatsApp. O usuário escolhe o destinatário e confirma o envio no WhatsApp; o FLUXA não envia mensagens sozinho.
- Uma seleção usa o mesmo endereço com `?imoveis=<id>,<id>`. O cliente pode ver fotos, características e valores sem criar conta. Links individuais também estão disponíveis na edição do anúncio.
- **Quero mais informações** e **Tenho interesse em visitar** abrem uma conversa com o contato comercial configurado, incluindo o imóvel e seu link. Não criam uma reserva, agendamento ou interessado automaticamente.
- Os links apresentam os anúncios que continuam publicados e disponíveis. Remover um anúncio da publicação ou desativar a vitrine interrompe novas consultas. Imóveis vendidos, alugados e inativos também deixam de aparecer; os disponíveis ou reservados podem ser exibidos quando publicados. As seleções não dão acesso a outros dados da empresa.

## Dados e fotos

As tabelas do catálogo ficam em `fluxa_catalog_private`, com RLS e permissões de leitura/escrita por organização e perfil. A edição é permitida aos perfis que já podem editar imóveis. Os outros perfis internos autorizados podem consultar e compartilhar os anúncios.

O endpoint público retorna uma lista explícita de campos: identificação do anúncio, código, título e descrição públicos, fotos, características, tipo, finalidade, valores, metragem, bairro, cidade e estado. Ele não retorna proprietário, responsável, rua, número, complemento, CEP, notas internas, contratos, documentos ou identificadores internos de clientes. Apenas o nome público e o WhatsApp comercial da vitrine são divulgados.

O bucket `real-estate-photos` é privado. Recebe apenas WebP de até 5 MB por foto, com até 20 fotos vinculadas a cada anúncio. O navegador aceita JPG/PNG/WebP de até 12 MB, reduz o lado maior para até 1600 pixels e reencoda a imagem, descartando metadados EXIF e o nome original. Arquivos enviados sem vínculo de foto não são públicos.

O acesso anônimo às imagens exige que a foto esteja vinculada a um anúncio publicado, numa vitrine ativa de empresa e módulo habilitados. URLs de imagem são assinadas por 120 segundos e renovadas pela página. Uma URL já emitida pode continuar válida até expirar, e cópias já baixadas não podem ser recolhidas. Excluir a última foto pela interface retira o anúncio da publicação.

As funções públicas são SECURITY INVOKER. As três funções privadas SECURITY DEFINER destinam-se exclusivamente à projeção pública e à verificação booleana de disponibilidade de anúncios/fotos; têm `search_path` fixo e não oferecem escrita. O acesso anônimo é intencional para publicidade, sem exigir `auth.uid()`. Nenhuma permissão anônima de leitura das tabelas privadas ou dos imóveis internos é adicionada.

## Verificação

`npm run check` valida tipos, lint, testes e build. O workflow Supabase também verifica a migration em banco vazio, os tipos públicos e as políticas reais com pgTAP. O cenário PGlite chamado por `tests/real-estate-overview.database.mjs` cobre publicação, rascunhos, fotos, campos expostos, seleção de IDs, filtros, paginação, limites, indisponibilidade, desativação e isolamento por empresa/perfil.

## Suspensão e reversão

Para suspender uma única imobiliária, desative sua vitrine na interface. Para reverter a entrega inteira, reverta a atualização da interface e execute `docs/operations/real-estate-catalog-disable.sql` como postgres. Esse script suspende todas as vitrines desse banco sem excluir anúncios, fotos ou cadastros. A retomada exige reativar cada vitrine deliberadamente.
