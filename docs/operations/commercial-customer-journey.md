# Checklist comercial da jornada do cliente

Use este roteiro antes de uma campanha, mudança no cadastro, alteração do plano ou atualização da integração Kiwify. O teste rotineiro deve parar antes de uma cobrança real; pagamentos só devem ser feitos em uma validação financeira planejada.

## 1. Entrada pública

- Abra `https://core-fluxa.lovable.app` em uma janela sem sessão.
- Confirme a oferta de **14 dias grátis**, **sem cartão** e o botão **Testar grátis**.
- Confirme que Termos de Uso e Política de Privacidade abrem sem exigir login.
- Clique em **Testar grátis** e verifique se o cadastro de nova empresa é exibido.

## 2. Cadastro e confirmação

- Use um e-mail novo controlado pela equipe de teste.
- Confirme que nome, e-mail, senha e aceite legal são obrigatórios.
- Crie a conta e confirme que o sistema pede a verificação do e-mail.
- Abra o link recebido e confirme que o usuário entra como **Proprietário** de uma nova empresa.
- Não use o cadastro público para membros de equipe; eles devem entrar pelo convite.

## 3. Configuração inicial

- Confirme o redirecionamento obrigatório para **Configuração da empresa**.
- Preencha, em ordem, Empresa, Localização, Operação e Conclusão.
- Confirme que não existe a opção **Concluir depois**.
- Ao finalizar, confirme o acesso à Central de Comando e a possibilidade de editar os dados em Configurações.

## 4. Teste grátis e operação

- Confirme o indicador de **14 dias** e o acesso aos módulos durante o teste.
- Cadastre um cliente, um processo, uma tarefa e um documento de teste.
- Convide membros até validar o limite comercial de **5 usuários**, contando convites pendentes.
- Confirme que um perfil operacional não administra cobrança nem cria outra empresa.

## 5. Assinatura

- Como Proprietário ou Administrador, abra **Minha assinatura**.
- Confirme o plano **FLUXA Essencial Mensal** por **R$ 149,90/mês**.
- Clique em **Assinar agora** e confira o checkout oficial da Kiwify.
- Confirme que o e-mail do checkout é o mesmo da preparação da assinatura.
- Encerre aqui o teste rotineiro, sem pagar.

## 6. Pagamento controlado

Execute esta parte somente quando uma cobrança real tiver sido planejada.

- Faça o pagamento usando uma conta de teste autorizada.
- Confirme a aprovação na Kiwify e o recebimento do webhook.
- Confirme que **Minha assinatura** mostra status ativo, próxima cobrança e acesso garantido.
- Confirme que o sistema não permite abrir um segundo checkout enquanto o acesso pago estiver vigente.
- Na Administração da plataforma, confirme o evento como **Processado** na saúde dos pagamentos.

## 7. Falhas e recuperação

- Uma falha acionável deve aparecer no sino do administrador da plataforma em até um minuto.
- O mesmo evento repetido não deve criar alertas duplicados.
- Uma tentativa posterior bem-sucedida deve gerar **Evento Kiwify recuperado**.
- O painel de saúde não deve exibir e-mail, CPF, telefone ou payload do comprador.

## Critério de liberação

A venda pode continuar quando os testes automatizados estiverem aprovados, as etapas públicas e de cadastro passarem no site publicado e não houver falhas em **Saúde dos pagamentos Kiwify**. Qualquer cobrança real exige conferência separada do valor, plano, conta recebedora e forma de pagamento antes da confirmação.
