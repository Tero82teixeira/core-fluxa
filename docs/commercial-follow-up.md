# Acompanhamento comercial

O FLUXA mantém dois acompanhamentos separados para evitar mistura de dados:

- **Administração da plataforma:** o dono do FLUXA acompanha empresas que estão testando o sistema.
- **Funil comercial da empresa:** cada empresa acompanha somente as próprias oportunidades e clientes.

## Administração da plataforma

No Radar de empresas em teste, o administrador da plataforma pode definir a situação comercial,
agendar o próximo contato, manter uma observação, abrir o WhatsApp ou copiar o e-mail. Um contato
registrado entra no histórico com data, canal, responsável e próximo retorno. As anotações não são
expostas diretamente ao navegador nem às empresas acompanhadas; somente RPCs protegidas por
`is_platform_admin()` conseguem acessá-las.

## Empresas usuárias

O Funil comercial continua sendo a fonte única das oportunidades. O acompanhamento acrescenta
situação de contato, data do último contato e histórico, sem criar outro cadastro de lead. A função
de escrita confirma o papel do usuário e o vínculo da oportunidade com a organização. Um usuário
de uma empresa não consegue consultar nem alterar o histórico de outra.

## Meu Dia

O Meu Dia inclui oportunidades atribuídas ao usuário que possuem próxima ação e, para o
administrador da plataforma, empresas em teste com próximo contato agendado. Retornos atrasados e
do dia aparecem antes dos itens futuros.

## Situações e canais

Situações: `not_contacted`, `following`, `interested` e `not_interested`.

Canais: `whatsapp`, `email`, `phone`, `meeting` e `other`.

## Publicação

Aplicar `20261004120000_commercial_follow_up.sql`, executar os testes pgTAP e publicar o frontend.
Nenhuma Edge Function ou segredo adicional é necessário.
