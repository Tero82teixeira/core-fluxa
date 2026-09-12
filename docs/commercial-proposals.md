# Propostas comerciais

O módulo de propostas fica em **Relatórios > Funil comercial**. Ele permite criar um rascunho, publicar um link público e registrar o aceite ou a recusa do interessado.

## Conversão após o aceite

O aceite é processado em uma única transação no banco e pode ser repetido com segurança, sem duplicar dados. O FLUXA:

1. localiza ou cria o cliente;
2. marca a oportunidade vinculada como ganha ou cria uma nova;
3. cria a receita inicial no Financeiro;
4. cria a recorrência quando a frequência for mensal, trimestral ou anual;
5. envia a primeira receita para a fila do Asaas quando a cobrança automática estiver habilitada;
6. registra evidências de auditoria e avisa a equipe.

O link público não expõe CPF/CNPJ, e-mail ou telefone. Ele usa um token próprio, tem data de validade e não permite acesso direto às tabelas internas.

## Aceite comercial

O registro guarda data, nome informado pelo responsável e hash do navegador. Esse mecanismo comprova o aceite comercial dentro do FLUXA, mas não substitui uma plataforma de assinatura eletrônica formal quando ela for exigida para o contrato.

## Publicação

Aplicar a migration `20261002120000_commercial_proposals.sql` e publicar novamente a Edge Function `asaas-billing-automation`. A rota pública `/proposta/:token` é entregue junto com o aplicativo.
