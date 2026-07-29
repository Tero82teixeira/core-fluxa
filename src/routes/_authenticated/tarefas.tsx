import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({
    meta: [
      { title: "Tarefas — FLUXA" },
      { name: "description", content: "Agenda operacional da equipe com responsáveis, prazos e checklists." },
      { property: "og:title", content: "Tarefas — FLUXA" },
      { property: "og:description", content: "Agenda operacional da equipe com responsáveis, prazos e checklists." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Tarefas"
        summary="Agenda operacional da equipe com responsáveis, prazos e checklists."
        bullets={["Quadro por responsável e por dia", "Checklists reutilizáveis por tipo de serviço", "Tarefas recorrentes", "Integração com processos e clientes"]}
      />
    </div>
  );
}
