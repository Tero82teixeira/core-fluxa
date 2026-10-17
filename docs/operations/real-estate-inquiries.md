# Atendimento da vitrine e agenda imobiliária

## Ativar em uma única execução

No SQL Editor do banco operacional `nobtbymxudlcsyurbopl`, execute **real-estate-inquiries-activate.sql** completo e depois publique em **Lovable → Publish → Update**. A ativação inclui o catálogo anterior de forma idempotente, pois a demonstração pode ter sido publicada sem a instalação da vitrine real. Cadastros imobiliários, interessados e visitas das etapas anteriores devem estar instalados. Não executar no projeto auxiliar de migração de funções.

O arquivo `real-estate-inquiries.sql` corresponde à nova migration. O arquivo de ativação combina `real-estate-catalog.sql` com esse script, sem alterar anúncios já cadastrados ou publicar imóveis automaticamente.

## Operação

- A vitrine de cada empresa deve estar ativa, com imóveis publicados e contato configurado. Nos anúncios, **Pedir informações** e **Solicitar visita** abrem o formulário. O WhatsApp continua disponível como alternativa.
- O visitante informa nome, telefone com DDD, finalidade, mensagem e, para visitas, dia/período preferidos. Deve autorizar o uso desses dados para atender o pedido. O retorno é somente uma confirmação de recebimento; não confirma horário ou reserva.
- Em **Imobiliária → Atendimento e visitas**, a fila começa em **Aguardando atendimento**. A equipe pode filtrar todas as situações, buscar e ver apenas seus atendimentos. **Atender / atribuir** define responsável ativo, situação e nota interna.
- **Vincular cliente** usa um cliente já cadastrado. Para um contato novo, cadastre-o primeiro em Clientes e volte à fila. O sistema não cria clientes automaticamente nem considera que um telefone informado prova identidade. Confirme os dados com a pessoa antes de vincular. O interesse existente de mesmo imóvel, cliente e finalidade é reutilizado. Interesses encerrados precisam ser revisados no cadastro existente.
- Após o vínculo, **Agendar visita** usa o cadastro e as regras existentes: responsável ativo, intervalo futuro de 15 minutos a 4 horas e sem sobreposição na agenda do responsável.
- A **Agenda de visitas** reúne também as visitas anteriores, independentemente da origem. **Registrar confirmação do cliente** registra que a equipe já obteve essa confirmação; não envia WhatsApp/e-mail. Reagendar invalida a confirmação anterior quando início ou término mudam. Horários são mostrados no fuso do dispositivo do operador, com o nome do fuso na tela; o banco armazena UTC.
- É possível registrar realização, cancelamento e não comparecimento, com resultado/motivo. A realização e o não comparecimento exigem que o horário inicial tenha passado. **Localizar imóvel / proposta** leva ao imóvel; a negociação continua pelo cadastro de interessados já existente.
- Encerrar um pedido não cancela a visita vinculada. Use a agenda para cancelar/reagendar explicitamente.

## Dados e permissões

Pedidos e confirmações ficam no schema privado `fluxa_inquiry_private`, com RLS, sem leitura ou escrita direta por `anon`. A leitura interna segue o módulo imobiliário e as permissões já existentes; edição é limitada aos mesmos papéis autorizados a operar imóveis. Requisições de edição verificam a versão para impedir sobrescrita silenciosa.

O endpoint de envio público é intencional: o wrapper é SECURITY INVOKER e chama a única função SECURITY DEFINER desse schema, `submit`, com `search_path` fixo. O visitante não precisa de conta, logo `auth.uid()` não é exigido nesse ingresso específico. A organização e o imóvel são derivados do token e anúncio publicado; o cliente não pode escolher organização, responsável, situação, vínculos ou notas internas. O resultado público é somente `{accepted:true}`, inclusive em reenvios. Dados de pedidos nunca entram na projeção pública de imóveis.

Nomes/telefones informados não são verificados por OTP. Há campo armadilha, validação de tamanho, autorização obrigatória, limite de 5 pedidos novos por telefone/empresa a cada 24 horas e 200 por empresa a cada 24 horas, serializados no banco. Um pedido aberto do mesmo telefone, imóvel e finalidade é reutilizado sem sobrescrever dados. Esses limites não equivalem a CAPTCHA nem a verificação de identidade. A fila serve para triagem humana.

## Demonstração

`/demo?area=real_estate` recebe a aba **Atendimento e visitas**. Pedidos fictícios enviados pela vitrine chegam à fila em memória. É possível atribuir, agendar/reagendar, simular confirmação e registrar resultado. Os exemplos são independentes do banco e descartados ao reiniciar/recarregar. Horários da demonstração são ilustrativos, a partir do cenário de 16/10/2026; não há confirmação nem mensagem real.

## Verificação e suspensão

A validação automatizada executa tipos, lint, testes, build, pgTAP e integração PGlite cobrindo ingresso anônimo, consentimento, deduplicação, limites, isolamento, conflitos de edição, vínculo, agenda, confirmação, reagendamento e paginação. A migração é validada também em banco sem os cadastros manuais, e os cenários operacionais são executados com esses cadastros instalados.

Para suspender novos pedidos mantendo a vitrine e os dados existentes, execute `real-estate-inquiries-disable.sql`. Para reativar, reaplique `real-estate-inquiries.sql`. Não há cron ou envio automático novo. A entrega não altera o banco operacional remotamente; a ativação acima é feita pelo proprietário.
