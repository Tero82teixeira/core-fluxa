import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações — FLUXA" },
      { name: "description", content: "Regras que reagem a eventos do processo sem intervenção manual." },
      { property: "og:title", content: "Automações — FLUXA" },
      { property: "og:description", content: "Regras que reagem a eventos do processo sem intervenção manual." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Automações"
        summary="Regras que reagem a eventos do processo sem intervenção manual."
        bullets={["Gatilhos por mudança de etapa", "Lembretes automáticos de prazo", "Cobrança automática de documentos", "Notificações para a equipe"]}
      />
    </div>
  );
}
