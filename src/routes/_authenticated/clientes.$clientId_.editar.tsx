import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
      { property: "og:description", content: "Atualize dados cadastrais, contato e endereço do cliente." },
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
      navigate({ to: "/clientes/$clientId", params: { clientId } });
    } catch (error) {
      const message = describeError(error, "cliente");
      if (/duplic|já existe|unique/i.test(message)) {
        setExternalErrors({ document: duplicateDocumentMessage(values.person_type) });
        toast.error(duplicateDocumentMessage(values.person_type));
        return;
      }
      toast.error(message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <Card>
        <CardContent className="p-6">
          <h1 className="page-title">Editar cliente</h1>
          <p className="page-subtitle mt-1">{data.name}</p>
          <div className="mt-6">
            <ClientForm
              initial={initial}
              submitLabel="Salvar alterações"
              pending={updateClient.isPending}
              externalErrors={externalErrors}
              onSubmit={submit}
              onCancel={() => navigate({ to: "/clientes/$clientId", params: { clientId } })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
