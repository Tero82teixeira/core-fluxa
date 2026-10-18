# Busca por voz e perfil público imobiliário

## Ativação

1. No projeto operacional `nobtbymxudlcsyurbopl`, execute todo o conteúdo de `real-estate-voice-profile.sql` no SQL Editor. O catálogo público precisa estar previamente ativado. Não executar nos projetos auxiliares.
2. Publique o código integrado: Lovable → Publish → Update.
3. Em Imobiliária → Vitrine e compartilhamento, salve a configuração da vitrine caso ainda não exista. Abra Perfil público da imobiliária e do corretor → Editar perfil e fotos. O perfil pode ficar vazio e é opcional.

## Uso

- Em Imóveis, Busca por voz permite ditar, revisar o texto e editar os filtros antes de Aplicar busca. Exemplo: “Apartamentos para alugar no Centro até mil e seiscentos reais”. A consulta inclui todo o cadastro autorizado, antes da paginação de 20 itens. O preço usa compra ou aluguel explicitamente. Limpar busca por voz retira os filtros aplicados.
- Em Clientes e Atendimento e visitas, a busca por voz procura pelo nome, dentro das permissões e dos demais filtros atuais. Exemplo: “Procurar cliente Carlos”. Não cadastra clientes nem modifica negociações.
- O perfil público contém um corretor em destaque por vitrine, com nome, foto, CRECI, apresentação e logo/CRECI da imobiliária. Não se trata de alteração automática dos perfis de login ou de um cadastro separado de toda a equipe. CRECI é informação fornecida pela empresa, sem selo de verificação.
- O contato público usa exclusivamente o WhatsApp comercial configurado na vitrine. A mensagem contém o link da vitrine/seleção. O cliente pode enviar áudio dentro do próprio WhatsApp. Não há captura automática de mensagens, envio automático ou anexos de áudio no FLUXA nesta etapa.
- A demonstração tem os mesmos componentes de voz e perfil. Alterações ficam em memória. O contato demonstra a ação sem abrir WhatsApp real nem enviar mensagens.

## Voz e compatibilidade

O recurso depende da Web Speech API (`SpeechRecognition` ou `webkitSpeechRecognition`), HTTPS, permissão do microfone e suporte do navegador/idioma. Pode depender de internet e de reconhecimento remoto pelo fornecedor do navegador. A explicação aparece antes de ativar o microfone. O FLUXA não grava nem armazena arquivos de áudio da busca. Sem suporte ou permissão, o texto pode ser digitado no mesmo fluxo.

O reconhecimento só começa por ação explícita. A sessão encerra ao fechar, sair da página, ocultar a aba, ao terminar ou em até 30 segundos. Não reinicia automaticamente. O analisador local cobre termos comuns de imóvel/finalidade, localidade e orçamento numérico ou valores comuns por extenso em português. Não é um assistente de IA geral. A revisão humana é obrigatória, especialmente em nomes, valores, comandos ambíguos ou frases fora do padrão. Não interpreta áudio como aceite de proposta ou assinatura.

## Dados e permissões

`fluxa_catalog_private.business_profiles` usa RLS e autorização já existente do módulo imobiliário. Somente papéis com escrita no módulo salvam. Versões impedem sobrescrever alterações de outra sessão. O RPC de gerenciamento é INVOKER e não é concedido a anon.

O acesso público é uma projeção explícita por token de vitrine ativa, empresa não arquivada e módulo imobiliário habilitado. As exceções DEFINER ficam no esquema privado, com search_path fixo, para projetar exclusivamente os campos públicos e verificar o acesso às imagens. Não concedem acesso a clientes, documentos, notas, endereço completo ou perfis de autenticação.

Imagens: bucket privado `real-estate-branding`, WebP até 5 MB. A interface aceita JPG/PNG/WebP até 12 MB, reencoda até 1600 px e remove metadados. Caminhos usam UUID da empresa e UUID aleatório, nunca nome original. Apenas arquivos vinculados ao perfil de uma vitrine ativa podem ser assinados publicamente. URLs assinadas duram 120 segundos e atualizam a cada 60 segundos; links já emitidos podem continuar válidos até expirar. Atualizar/remover imagem retira a referência primeiro; somente arquivos não referenciados podem ser apagados.

## Validação e reversão

Testes automatizados cobrem parsing, erro/permissão/timeout e cancelamento da voz, renderização dos componentes em PT/EN/ES, isolamento por empresa/perfil, concorrência, projeção pública, imagens não vinculadas e preço antes da paginação. Não substituem uma sessão com microfone físico em cada navegador.

Para retirar o perfil público, remova os campos/fotos e salve, ou desative a vitrine para ocultar também os anúncios. Para reverter o frontend, use um novo commit que reverta a entrega, sem reescrever o histórico. As adições de banco podem permanecer inativas. Não apagar tabela/bucket com dados durante uma reversão de interface.

Referências: https://supabase.com/docs/guides/storage/security/access-control ; https://supabase.com/docs/guides/database/functions ; https://webaudio.github.io/web-speech-api/ .
