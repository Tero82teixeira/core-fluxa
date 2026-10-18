# Início rápido e ficha do cliente

Em telas com menos de 1024 px, a entrada de Imóveis da área imobiliária oferece busca por nome/voz, Clientes, Imóveis e Agenda. O botão Versão completa abre a operação existente; Início rápido permite voltar. Links de pendências continuam abrindo diretamente a operação completa. Computadores e links públicos de catálogo mantêm o fluxo anterior.

A demonstração usa a mesma interface com dados fictícios e não chama o banco. “Cliente Marina Costa” abre uma ficha; “cliente Carlos” oferece dois nomes. Dados alterados na demonstração completa alimentam a consulta móvel ao retornar ao início rápido. A agenda da demonstração é simulada. O catálogo público para clientes não vira um painel de corretor.

## Ativação operacional

Depois de fundação, atividade, propostas, contratos, catálogo, atendimentos, retornos e preferências, executar `real-estate-mobile-client.sql` uma vez no banco operacional **nobtbymxudlcsyurbopl** e publicar a atualização no Lovable. O SQL é idempotente e não modifica registros. Não executar nos bancos auxiliares nem usar db push para instalar a fundação manual. A migração versionada contém o mesmo SQL, com referências PL/pgSQL resolvidas na chamada para compatibilidade com a validação de instalações novas sem a fundação operacional.

## Consulta e permissões

`real_estate_mobile` é SECURITY INVOKER com search_path vazio e somente authenticated tem EXECUTE. Valida área, associação e RLS. Busca e ficha usam **clients_secure**, inclusive restrição de carteira e campos sensíveis nulos por papel. Não há consulta pública, service role, modificação de políticas, envio de mensagem ou alteração de negócio. Abrir WhatsApp apenas entrega o contato ao aplicativo; nenhum texto é enviado automaticamente.

Interesses, visitas e propostas são vinculados pelo cliente cadastrado. Preferências e retornos usam o vínculo explícito do atendimento ao interesse, sempre com empresa/imóvel. Não se vinculam pessoas pelo nome ou telefone. Cada proposta/contrato mostra seu evento mais recente e valor registrado; proposta aceita não é apresentada como compra concluída. Contratos incluem status e vigência; não afirmam escritura ou pagamento. Campo sem registro permanece ausente. A ficha é paginada em 20 registros, com navegação e cadastro completo acessível no sistema.

Agenda contém visitas agendadas e retornos abertos atribuídos ao usuário, dentro do dia local do dispositivo (intervalo UTC com limite exclusivo no fim). Atendimentos sem cliente vinculado não produzem ficha inventada. A agenda renova a cada minuto, com paginação e estados de erro/vazio. Imóveis exibem cartões paginados com código, localização, status e valores.

## Voz e dispositivos

Microfone somente após toque, em contexto seguro e navegador compatível com SpeechRecognition/webkitSpeechRecognition. Android/iPhone/tablet usam o navegador; esta entrega não instala aplicativo nativo e não garante suporte de voz em todo navegador. Busca digitada fica disponível. Transcrição é processada pelo serviço do navegador; FLUXA não armazena áudio nem transcrição. Timeout de 30 s, encerramento ao sair/ocultar aba e proteção contra callbacks/respostas antigos.

Uma correspondência única no conjunto completo abre a ficha. Homônimos mostram seleção, inclusive quando a primeira página tem somente um item mas o total é maior. Todas as consultas são somente leitura. Edições, aceite e fechamento permanecem nos fluxos existentes.

## Validação e reversão

Cobertura: renderização real PT/EN/ES e escape de conteúdo; nomes ambíguos, telefone seguro, cenário demonstrativo e contrato após formalização; PGlite com pesquisa literal/acento/paginação, campos mascarados, cliente invisível, outras empresas/perfis, histórico explícito, status/valor atual de contratos, agenda própria e limite de dia; pgTAP de privilégios. Rodar npm run check e o encadeamento real-estate-overview.database.mjs.

Reversão: publicar o código anterior e revogar EXECUTE de authenticated em public.real_estate_mobile(uuid,text,jsonb). Não é necessário apagar tabelas nem dados, pois este lote cria somente a função de consulta.
