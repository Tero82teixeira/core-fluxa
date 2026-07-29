import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — FLUXA" },
      { name: "description", content: "Controle de honorários, cobranças e recebimentos por processo." },
      { property: "og:title", content: "Financeiro — FLUXA" },
      { property: "og:description", content: "Controle de honorários, cobranças e recebimentos por processo." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Financeiro"
        summary="Controle de honorários, cobranças e recebimentos por processo."
        bullets={["Lançamentos por processo e cliente", "Situação financeira e inadimplência", "Previsão de receita", "Relatórios de faturamento"]}
      />
    </div>
  );
}
