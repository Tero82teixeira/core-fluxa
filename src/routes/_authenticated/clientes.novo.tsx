import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState } from "react";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useCreateClient } from "@/hooks/use-mutations";
import { describeError } from "@/lib/errors";
import {
  duplicateDocumentMessage,
  emptyClientForm,
  toClientPayload,
  type ClientFormValues,
  type FieldErrors,
} from "@/lib/validators";

import { Card, CardContent } from "@/components/ui/card";
import { ClientForm } from "@/components/clients/client-form";

export const Route = createFileRoute("/_authenticated/clientes/novo")({
  head: () => ({
    meta: [
      { title: "Novo cliente — FLUXA" },
      {
        name: "description",
        content: "Cadastre um cliente PF ou PJ com documento, contatos e endereço.",
      },
      { property: "og:title", content: "Novo cliente — FLUXA" },
      {
        property: "og:description",
        content: "Cadastre um cliente PF ou PJ com documento, contatos e endereço.",
      },
    ],
  }),
  component: NewClient,
});

function NewClient() {
  const navigate = useNavigate();
  const { organizationId, displayName } = useWorkspace();
  const permissions = usePermissions();
  const createClient = useCreateClient(organizationId);
  const [externalErrors, setExternalErrors] = useState<FieldErrors>({});
  const createdClientId = useRef<string | null>(null);

  const submit = async (values: ClientFormValues) => {
    if (!organizationId) {
      toast.error("Selecione uma empresa antes de cadastrar clientes.");
      return false;
    }
    setExternalErrors({});
    try {
      const created = await createClient.mutateAsync(toClientPayload(values));
      createdClientId.current = created.id;
      toast.success("Cliente cadastrado.");
      return true;
    } catch (error) {
      const message = describeError(error, "cliente");
      if (/duplic|já existe|unique/i.test(message)) {
        setExternalErrors({ document: duplicateDocumentMessage(values.person_type) });
        toast.error(duplicateDocumentMessage(values.person_type));
        return false;
      }
      toast.error(message);
      return false;
    }
  };

  if (!permissions.canCreate) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Seu perfil tem acesso somente de leitura e não pode cadastrar clientes.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-cyan-400/15 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20">
            <UserPlus className="size-5.5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-cyan-300 uppercase">
              Nova relação
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Novo cliente</h1>
          </div>
        </div>
        <p className="relative mt-4 max-w-2xl text-sm leading-6 text-slate-300">
          Reúna dados cadastrais, contato e endereço para iniciar o atendimento com contexto.
        </p>
      </header>
      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardContent className="p-4 sm:p-6 lg:p-7">
          <div className="mb-6">
            <p className="text-sm font-semibold">Informações do cliente</p>
            <p className="helper-text mt-1">
              Campos organizados por identificação, contato e localização.
            </p>
          </div>
          <div>
            <ClientForm
              initial={{ ...emptyClientForm(), owner_name: displayName ?? "" }}
              submitLabel="Salvar cliente"
              pending={createClient.isPending}
              externalErrors={externalErrors}
              onSubmit={submit}
              onSaved={() => {
                const createdId = createdClientId.current;
                if (createdId)
                  navigate({ to: "/clientes/$clientId", params: { clientId: createdId } });
              }}
              onCancel={() => navigate({ to: "/clientes" })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
