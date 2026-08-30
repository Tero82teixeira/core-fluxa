import { createFileRoute } from "@tanstack/react-router";

import { LegalPageLayout } from "@/components/legal-page-layout";

export const Route = createFileRoute("/termos-de-uso")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — FLUXA" },
      { name: "description", content: "Condições para uso da plataforma FLUXA." },
    ],
  }),
  component: TermsOfUsePage,
});

function TermsOfUsePage() {
  return (
    <LegalPageLayout
      title="Termos de Uso"
      description="Estes Termos estabelecem as condições para criar uma conta, administrar uma empresa e utilizar os recursos da FLUXA."
    >
      <section>
        <h2>1. Aceitação e capacidade</h2>
        <p>
          Ao criar uma conta, você declara ter capacidade para aceitar estes Termos e, quando agir
          em nome de uma empresa, possuir autorização para vinculá-la. Usuários convidados também
          devem respeitar estes Termos dentro das permissões concedidas pela empresa.
        </p>
      </section>

      <section>
        <h2>2. O serviço</h2>
        <p>
          A FLUXA é uma plataforma de gestão empresarial que reúne clientes, processos, documentos,
          tarefas, comunicação, financeiro, relatórios e automações. Recursos podem ser aprimorados,
          substituídos ou descontinuados para segurança, evolução técnica ou adequação do produto,
          com comunicação quando a alteração for relevante.
        </p>
      </section>

      <section>
        <h2>3. Conta, empresa e permissões</h2>
        <ul>
          <li>
            O cadastro público cria uma nova empresa e atribui ao criador o papel de Proprietário.
          </li>
          <li>
            Usuários de equipe devem entrar pelo convite enviado por um administrador; o convite não
            cria outra empresa.
          </li>
          <li>
            Cada pessoa deve fornecer dados corretos, proteger sua senha e comunicar acessos
            suspeitos.
          </li>
          <li>
            O Proprietário administra membros, papéis e informações da empresa e responde pelas
            autorizações concedidas.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Teste, contratação e cobrança</h2>
        <p>
          Quando oferecido, o período de teste começa conforme indicado no cadastro. A continuidade
          após o teste poderá depender da contratação de um plano. Preços, limites, vencimentos e
          condições comerciais serão apresentados antes de qualquer cobrança. A FLUXA não realizará
          cobrança sem uma contratação correspondente.
        </p>
      </section>

      <section>
        <h2>5. Conteúdo e uso permitido</h2>
        <p>
          A empresa mantém a titularidade e a responsabilidade pelos dados que cadastrar. É
          proibido:
        </p>
        <ul>
          <li>usar a plataforma para atividade ilegal, fraude, assédio ou violação de direitos;</li>
          <li>inserir dados sem base legal ou autorização adequada;</li>
          <li>tentar acessar outra empresa, contornar permissões ou comprometer a segurança;</li>
          <li>
            copiar, explorar ou realizar engenharia reversa do serviço fora das hipóteses permitidas
            em lei.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Disponibilidade, segurança e cópias</h2>
        <p>
          A FLUXA adota medidas técnicas e administrativas compatíveis com o serviço, mas nenhum
          sistema é completamente imune a falhas. Manutenções e indisponibilidades podem ocorrer. A
          empresa usuária deve manter procedimentos internos adequados e cópias dos conteúdos cuja
          preservação seja crítica para sua atividade.
        </p>
      </section>

      <section>
        <h2>7. Suspensão e encerramento</h2>
        <p>
          O acesso poderá ser limitado ou suspenso diante de risco de segurança, violação destes
          Termos, uso ilegal ou inadimplência aplicável. O usuário pode solicitar o encerramento
          pelos canais de suporte. Obrigações que, por sua natureza, devam permanecer após o
          encerramento continuarão válidas.
        </p>
      </section>

      <section>
        <h2>8. Propriedade intelectual</h2>
        <p>
          A marca, a interface, o código e os demais componentes da FLUXA são protegidos pela
          legislação aplicável. Estes Termos concedem somente uma licença limitada, revogável, não
          exclusiva e intransferível para usar o serviço durante a vigência do acesso.
        </p>
      </section>

      <section>
        <h2>9. Responsabilidade</h2>
        <p>
          A FLUXA apoia a organização da rotina, mas não substitui decisões profissionais,
          contábeis, jurídicas ou financeiras. Cada empresa responde pela conferência dos dados,
          pelas decisões tomadas e pelo cumprimento das normas aplicáveis à sua atividade. Eventuais
          responsabilidades serão apuradas conforme a legislação brasileira, sem excluir direitos
          que não possam ser limitados.
        </p>
      </section>

      <section>
        <h2>10. Alterações e contato</h2>
        <p>
          Alterações relevantes serão identificadas por uma nova versão e, quando necessário,
          apresentadas para novo aceite. Dúvidas ou solicitações podem ser encaminhadas pelo canal
          de suporte disponibilizado na plataforma. Aplica-se a legislação brasileira, preservados
          os direitos do consumidor e as regras legais de competência.
        </p>
      </section>
    </LegalPageLayout>
  );
}
