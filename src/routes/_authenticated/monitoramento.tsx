import { createFileRoute } from "@tanstack/react-router";

import { Gauge } from "lucide-react";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/monitoramento")({
  head: () => ({
    meta: [
      { title: "Monitoramento — FLUXA" },
      { name: "description", content: "Painel de prazos, vencimentos e alertas antecipados da operação." },
      { property: "og:title", content: "Monitoramento — FLUXA" },
      { property: "og:description", content: "Painel de prazos, vencimentos e alertas antecipados da operação." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Monitoramento"
        benefit="Antecipe prazos críticos antes que virem problema."
        icon={Gauge}
        variant="timeline"
        summary="Painel de prazos, vencimentos e alertas antecipados da operação."
        bullets={["Linha do tempo de prazos críticos", "Alertas configuráveis por antecedência", "Renovações recorrentes", "Riscos por cliente e por responsável"]}
      />
    </div>
  );
}
