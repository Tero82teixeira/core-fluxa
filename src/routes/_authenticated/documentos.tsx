import { createFileRoute } from "@tanstack/react-router";

import { FolderOpen } from "lucide-react";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos — FLUXA" },
      { name: "description", content: "Repositório central de arquivos por cliente e processo, com controle de validade." },
      { property: "og:title", content: "Documentos — FLUXA" },
      { property: "og:description", content: "Repositório central de arquivos por cliente e processo, com controle de validade." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Documentos"
        benefit="Nunca mais perca um documento ou deixe uma validade vencer."
        icon={FolderOpen}
        variant="list"
        summary="Repositório central de arquivos por cliente e processo, com controle de validade."
        bullets={["Upload com categorização automática", "Controle de vencimento de documentos", "Versionamento e histórico de substituições", "Solicitação de documentos ao cliente"]}
      />
    </div>
  );
}
