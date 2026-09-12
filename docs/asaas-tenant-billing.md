# Cobranças Asaas por empresa

Cada empresa conecta a própria conta Asaas ao FLUXA. O dinheiro pago pelos clientes vai para essa
conta; não passa pela conta do FLUXA. A Kiwify continua sendo usada exclusivamente para cobrar a
assinatura do próprio FLUXA.

## Ativação

1. Aplique a migration `20260930120000_asaas_tenant_billing.sql`.
2. Gere uma chave de criptografia:

   ```bash
   openssl rand -base64 48
   ```

3. Configure o secret sem versionar o valor:

   ```bash
   supabase secrets set ASAAS_CREDENTIALS_ENCRYPTION_KEY="valor-gerado"
   ```

4. Publique as funções:

   ```bash
   supabase functions deploy asaas-connector
   supabase functions deploy asaas-webhook --no-verify-jwt
   supabase functions deploy asaas-billing-automation --no-verify-jwt
   ```

5. Em **Configurações > Financeiro**, conecte primeiro uma chave do Sandbox e escolha a conta
   financeira que receberá a conciliação automática.
6. Crie uma receita vinculada a um cliente com CPF/CNPJ, gere a cobrança e simule pagamento,
   vencimento, cancelamento e estorno.
7. Somente depois dos testes, reconecte usando o ambiente de Produção e a chave de produção da
   empresa.

## Cobrança recorrente e lembretes

Depois da ativação inicial, aplique também a migration
`20261001120000_asaas_recurring_collection.sql`. No Lovable Cloud, crie um Job agendado para chamar
`asaas-billing-automation` a cada hora com `POST` e autorização de serviço. A função rejeita chamadas
sem a chave de serviço e nunca recebe essa chave do navegador.

Em uma recorrência de receita, a empresa pode ativar **Gerar cobrança automática no Asaas** e
escolher de 0 a 30 dias de antecedência. Cada lançamento entra em uma fila idempotente: existe no
máximo um trabalho automático por lançamento e o Asaas também é consultado pelo identificador
externo antes de criar o pagamento.

O relógio já existente do banco cria avisos no portal 3 e 1 dia antes, no vencimento e após 3 e 7
dias de atraso. O aviso abre diretamente a cobrança. Push é enviado somente quando o cliente
permitiu notificações no dispositivo.

Na aba **Financeiro > Cobranças Asaas**, a equipe acompanha valores aguardando, vencidos e
recebidos, clientes inadimplentes, faixas de atraso e divergências de conciliação. Uma cobrança pode
ser sincronizada com o Asaas; uma falha automática pode ser reprogramada depois da correção da
causa.

O endpoint público do webhook não usa JWT porque é chamado pelo Asaas, mas cada conexão recebe um
token aleatório próprio. A credencial da API é cifrada com AES-GCM e nunca volta para o navegador.

## Regras da primeira versão

- Pix, boleto e cartão são escolhidos no checkout hospedado pelo Asaas (`UNDEFINED`). O FLUXA não
  coleta nem armazena dados de cartão.
- Pagamento confirmado atualiza cobrança, lançamento, pagamento, movimentação e saldo da conta de
  forma idempotente.
- Estorno integral e chargeback fazem a reversão automática.
- Estorno parcial deve ser tratado manualmente nesta primeira versão.
- Enquanto a cobrança estiver ativa, edição, baixa ou cancelamento manual do lançamento ficam
  bloqueados. Cancele primeiro a cobrança no Asaas para impedir pagamento duplicado.
