import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/ajuda")({
  head: () => ({
    meta: [
      { title: "Ajuda e suporte — FLUXA" },
      { name: "description", content: "Central de documentação e canais de atendimento do FLUXA." },
      { property: "og:title", content: "Ajuda e suporte — FLUXA" },
      { property: "og:description", content: "Central de documentação e canais de atendimento do FLUXA." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Ajuda e suporte"
        summary="Central de documentação e canais de atendimento do FLUXA."
        bullets={["Base de conhecimento", "Abertura de chamados", "Treinamentos da equipe", "Status da plataforma"]}
      />
    </div>
  );
}
