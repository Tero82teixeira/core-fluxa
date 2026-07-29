import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/comunicacao")({
  head: () => ({
    meta: [
      { title: "Comunicação — FLUXA" },
      { name: "description", content: "Histórico unificado de conversas, e-mails e mensagens com clientes." },
      { property: "og:title", content: "Comunicação — FLUXA" },
      { property: "og:description", content: "Histórico unificado de conversas, e-mails e mensagens com clientes." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <ComingSoon
        title="Comunicação"
        summary="Histórico unificado de conversas, e-mails e mensagens com clientes."
        bullets={["Registro de interações por cliente", "Modelos de mensagem", "Envio de atualizações de processo", "Caixa de entrada compartilhada"]}
      />
    </div>
  );
}
