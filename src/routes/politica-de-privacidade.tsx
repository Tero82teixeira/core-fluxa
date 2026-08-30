import { createFileRoute } from "@tanstack/react-router";

import { LegalPageLayout } from "@/components/legal-page-layout";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — FLUXA" },
      {
        name: "description",
        content: "Como a FLUXA trata dados pessoais e protege a privacidade dos usuários.",
      },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Política de Privacidade"
      description="Este aviso explica quais dados pessoais são tratados pela FLUXA, para quais finalidades e como os titulares podem exercer seus direitos."
    >
      <section>
        <h2>1. Papéis no tratamento de dados</h2>
        <p>
          A FLUXA atua como controladora dos dados necessários para cadastro, autenticação,
          segurança, contratação e suporte da própria plataforma. Em relação aos dados de clientes,
          processos, documentos e demais conteúdos inseridos por uma empresa usuária, essa empresa
          normalmente define as finalidades e atua como controladora, enquanto a FLUXA realiza o
          tratamento para prestar o serviço, na condição de operadora.
        </p>
      </section>

      <section>
        <h2>2. Dados tratados</h2>
        <ul>
          <li>
            cadastro e acesso: nome, e-mail, identificadores da conta e registros de autenticação;
          </li>
          <li>
            empresa: razão social, nome fantasia, CPF ou CNPJ, endereço e contatos informados;
          </li>
          <li>
            uso e segurança: ações relevantes, data e horário, sessão, erros e informações técnicas
            necessárias à proteção do serviço;
          </li>
          <li>
            suporte e contratação: mensagens, solicitações, plano e informações de pagamento quando
            esses recursos forem utilizados;
          </li>
          <li>
            conteúdo empresarial: dados cadastrados pela organização em seus módulos e documentos.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Finalidades e bases legais</h2>
        <p>Os dados podem ser tratados para:</p>
        <ul>
          <li>criar a conta, autenticar usuários e executar o contrato do serviço;</li>
          <li>organizar os dados da empresa conforme suas instruções;</li>
          <li>proteger contas, prevenir fraude, manter auditoria e exercer direitos;</li>
          <li>cumprir obrigações legais e regulatórias;</li>
          <li>prestar suporte, aprimorar estabilidade e comunicar alterações importantes.</li>
        </ul>
        <p>
          Conforme a finalidade, o tratamento pode se apoiar na execução de contrato, cumprimento de
          obrigação legal, exercício regular de direitos, legítimo interesse após avaliação adequada
          ou consentimento quando ele for efetivamente necessário. O aceite desta Política registra
          ciência e transparência; não transforma o consentimento na base legal de todas as
          operações.
        </p>
      </section>

      <section>
        <h2>4. Compartilhamento</h2>
        <p>
          Dados são compartilhados apenas quando necessário com provedores de infraestrutura,
          hospedagem, autenticação, armazenamento, comunicação, monitoramento e pagamento; com
          autoridades quando houver obrigação legal; ou em operações societárias legítimas,
          observadas as salvaguardas aplicáveis. A FLUXA não vende dados pessoais.
        </p>
      </section>

      <section>
        <h2>5. Armazenamento, retenção e transferência</h2>
        <p>
          Os dados são mantidos pelo período necessário para prestar o serviço, cumprir obrigações,
          proteger direitos e atender prazos legais. Depois disso, podem ser eliminados ou
          anonimizados, salvo quando a conservação for permitida ou exigida. Alguns fornecedores
          podem processar dados fora do Brasil; nesses casos devem ser adotados mecanismos admitidos
          pela LGPD e medidas contratuais e de segurança compatíveis.
        </p>
      </section>

      <section>
        <h2>6. Segurança</h2>
        <p>
          São adotados controles de acesso por empresa e função, validações no banco de dados,
          registros de ações relevantes e outras medidas técnicas e administrativas proporcionais
          aos riscos. Incidentes serão tratados conforme o plano aplicável e as exigências legais.
          Usuários também devem manter senhas protegidas e acessos de equipe atualizados.
        </p>
      </section>

      <section>
        <h2>7. Direitos dos titulares</h2>
        <p>
          Nos termos da LGPD, o titular pode solicitar, quando aplicável, confirmação e acesso,
          correção, anonimização, bloqueio ou eliminação, portabilidade, informação sobre
          compartilhamentos, revisão de decisões automatizadas, oposição e revogação de
          consentimento. A identidade poderá ser verificada para proteger a conta. Quando a
          solicitação envolver conteúdo controlado por uma empresa cliente, ela será encaminhada ou
          tratada conforme as instruções dessa empresa.
        </p>
      </section>

      <section>
        <h2>8. Cookies e armazenamento local</h2>
        <p>
          A plataforma pode usar cookies e armazenamento local estritamente necessários para sessão,
          segurança, preferência de empresa, tema e lembrança do e-mail de acesso. Se tecnologias
          opcionais de análise ou publicidade forem adicionadas, serão informadas e gerenciadas
          conforme a legislação aplicável.
        </p>
      </section>

      <section>
        <h2>9. Crianças e adolescentes</h2>
        <p>
          A FLUXA é destinada ao uso profissional e não é direcionada a crianças. Empresas usuárias
          que tratem dados de crianças ou adolescentes em seus conteúdos devem observar as
          exigências específicas da LGPD e demais normas aplicáveis.
        </p>
      </section>

      <section>
        <h2>10. Solicitações e atualizações</h2>
        <p>
          Solicitações de privacidade podem ser abertas pelo canal de suporte disponibilizado na
          plataforma. Esta Política poderá ser atualizada para refletir mudanças legais, técnicas ou
          operacionais. Alterações relevantes receberão uma nova versão e comunicação adequada.
        </p>
      </section>
    </LegalPageLayout>
  );
}
