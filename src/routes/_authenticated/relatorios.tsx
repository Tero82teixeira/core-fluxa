import { createFileRoute } from "@tanstack/react-router";

import { PieChart } from "lucide-react";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — FLUXA" },
      { name: "description", content: "Indicadores gerenciais e exportações da operação." },
      { property: "og:title", content: "Relatórios — FLUXA" },
      { property: "og:description", content: "Indicadores gerenciais e exportações da operação." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Relatórios"
        benefit="Decisões apoiadas em indicadores reais da operação."
        icon={PieChart}
        variant="split"
        summary="Indicadores gerenciais e exportações da operação."
        bullets={["Produtividade por responsável", "Tempo médio por etapa", "Taxa de deferimento", "Exportação em planilha e PDF"]}
      />
    </div>
  );
}
