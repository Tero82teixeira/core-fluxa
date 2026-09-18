import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useCreateClient } from "@/hooks/use-mutations";
import { describeError } from "@/lib/errors";
import { duplicateDocumentMessage, emptyClientForm, toClientPayload, type ClientFormValues, type FieldErrors } from "@/lib/validators";

import { Card, CardContent } from "@/components/ui/card";
import { ClientForm } from "@/components/clients/client-form";

export const Route = createFileRoute("/_authenticated/clientes/novo")({
  head: () => ({
    meta: [
      { title: "Novo cliente — FLUXA" },
      { name: "description", content: "Cadastre um cliente PF ou PJ com documento, contatos e endereço." },
      { property: "og:title", content: "Novo cliente — FLUXA" },
      { property: "og:description", content: "Cadastre um cliente PF ou PJ com documento, contatos e endereço." },
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

  const submit = async (values: ClientFormValues) => {
    if (!organizationId) {
      toast.error("Selecione uma empresa antes de cadastrar clientes.");
      return;
    }
    setExternalErrors({});
    try {
      const created = await createClient.mutateAsync(toClientPayload(values));
      toast.success("Cliente cadastrado.");
      navigate({ to: "/clientes/$clientId", params: { clientId: created.id } });
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
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <Card>
        <CardContent className="p-6">
          <h1 className="page-title">Novo cliente</h1>
          <p className="page-subtitle mt-1">Dados cadastrais, contato e endereço.</p>
          <div className="mt-6">
            <ClientForm
              initial={{ ...emptyClientForm(), owner_name: displayName ?? "" }}
              submitLabel="Salvar cliente"
              pending={createClient.isPending}
              externalErrors={externalErrors}
              onSubmit={submit}
              onCancel={() => navigate({ to: "/clientes" })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
