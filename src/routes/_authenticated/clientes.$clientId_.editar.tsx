import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";

import { useClient } from "@/hooks/use-operations";
import { useUpdateClient } from "@/hooks/use-mutations";
import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { describeError } from "@/lib/errors";
import {
  duplicateDocumentMessage,
  emptyClientForm,
  toClientPayload,
  type ClientFormValues,
  type FieldErrors,
} from "@/lib/validators";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientForm } from "@/components/clients/client-form";

export const Route = createFileRoute("/_authenticated/clientes/$clientId_/editar")({
  head: () => ({
    meta: [
      { title: "Editar cliente — FLUXA" },
      { name: "description", content: "Atualize dados cadastrais, contato e endereço do cliente." },
      { property: "og:title", content: "Editar cliente — FLUXA" },
      {
        property: "og:description",
        content: "Atualize dados cadastrais, contato e endereço do cliente.",
      },
    ],
  }),
  component: EditClient,
});

function EditClient() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const client = useClient(clientId);
  const updateClient = useUpdateClient(organizationId);
  const [externalErrors, setExternalErrors] = useState<FieldErrors>({});

  if (client.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!client.data || !permissions.canEdit) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {client.data ? "Seu perfil não pode editar clientes." : "Cliente não encontrado."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = client.data;
  const initial: ClientFormValues = {
    ...emptyClientForm(),
    person_type: data.person_type,
    name: data.name,
    trade_name: data.trade_name ?? "",
    document: data.document ?? "",
    birth_date: data.birth_date ?? "",
    legal_rep_name: data.legal_rep_name ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    whatsapp: data.whatsapp ?? "",
    zip_code: data.zip_code ?? "",
    street: data.street ?? "",
    number: data.number ?? "",
    complement: data.complement ?? "",
    district: data.district ?? "",
    city: data.city ?? "",
    state: data.state ?? "",
    owner_name: data.owner_name ?? "",
    status: data.archived_at ? "ativo" : data.status,
    notes: data.notes ?? "",
  };

  const submit = async (values: ClientFormValues) => {
    setExternalErrors({});
    try {
      await updateClient.mutateAsync({ id: clientId, values: toClientPayload(values) });
      toast.success("Cadastro atualizado.");
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-blue-400/15 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-blue-400 text-slate-950 shadow-lg shadow-blue-400/20">
            <PencilLine className="size-5.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-blue-300 uppercase">
              Atualização cadastral
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Editar cliente</h1>
          </div>
        </div>
        <p className="relative mt-4 max-w-2xl truncate text-sm leading-6 text-slate-300">
          {data.name}
        </p>
      </header>
      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardContent className="p-4 sm:p-6 lg:p-7">
          <div className="mb-6">
            <p className="text-sm font-semibold">Dados do relacionamento</p>
            <p className="helper-text mt-1">
              Revise os campos e salve somente o que precisar alterar.
            </p>
          </div>
          <div>
            <ClientForm
              initial={initial}
              submitLabel="Salvar alterações"
              pending={updateClient.isPending}
              externalErrors={externalErrors}
              onSubmit={submit}
              onSaved={() => navigate({ to: "/clientes/$clientId", params: { clientId } })}
              onCancel={() => navigate({ to: "/clientes/$clientId", params: { clientId } })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
