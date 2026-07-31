import { createFileRoute } from "@tanstack/react-router";

import { UsersRound } from "lucide-react";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — FLUXA" },
      { name: "description", content: "Gestão de usuários, convites e permissões do workspace." },
      { property: "og:title", content: "Equipe — FLUXA" },
      { property: "og:description", content: "Gestão de usuários, convites e permissões do workspace." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Equipe"
        benefit="Cada pessoa com o acesso certo, com trilha de auditoria."
        icon={UsersRound}
        variant="list"
        summary="Gestão de usuários, convites e permissões do workspace."
        bullets={["Convite de membros por e-mail", "Atribuição de perfis e permissões", "Carga de trabalho por usuário", "Registro de auditoria por usuário"]}
      />
    </div>
  );
}
