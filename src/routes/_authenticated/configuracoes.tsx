import { createFileRoute } from "@tanstack/react-router";

import { Settings } from "lucide-react";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — FLUXA" },
      { name: "description", content: "Preferências do workspace, identidade visual e portal do cliente." },
      { property: "og:title", content: "Configurações — FLUXA" },
      { property: "og:description", content: "Preferências do workspace, identidade visual e portal do cliente." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Configurações"
        benefit="A FLUXA adaptada ao jeito de trabalhar da sua empresa."
        icon={Settings}
        variant="split"
        summary="Preferências do workspace, identidade visual e portal do cliente."
        bullets={["Dados cadastrais da empresa", "Tipos de serviço e etapas personalizadas", "Identidade visual e portal do cliente", "Integrações e chaves de acesso"]}
      />
    </div>
  );
}
