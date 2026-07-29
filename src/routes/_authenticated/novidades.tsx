import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/novidades")({
  head: () => ({
    meta: [
      { title: "Novidades — FLUXA" },
      { name: "description", content: "Registro das entregas e melhorias da plataforma." },
      { property: "og:title", content: "Novidades — FLUXA" },
      { property: "og:description", content: "Registro das entregas e melhorias da plataforma." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Novidades"
        summary="Registro das entregas e melhorias da plataforma."
        bullets={["Notas de versão", "Recursos em desenvolvimento", "Roteiro público", "Feedback do produto"]}
      />
    </div>
  );
}
