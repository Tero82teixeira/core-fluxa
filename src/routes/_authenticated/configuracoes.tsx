import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Layers, Lock } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useAllServiceTypes, useArchiveServiceType, useSaveServiceType } from "@/hooks/use-mutations";
import { describeError } from "@/lib/errors";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — FLUXA" },
      { name: "description", content: "Catálogo de tipos de serviço, prazos padrão e checklists da empresa." },
      { property: "og:title", content: "Configurações — FLUXA" },
      { property: "og:description", content: "Catálogo de tipos de serviço, prazos padrão e checklists da empresa." },
    ],
  }),
  component: SettingsPage;
});

const emptyForm = { id: "", name: "", description: "", default_days: "", default_value: "", checklist: "" };

function SettingsPage() {
  const { organizationId, organizationName } = useWorkspace();
  const permissions = usePermissions();
  const serviceTypes = useAllServiceTypes(organizationId);
  const saveServiceType = useSaveServiceType(organizationId);
  const archiveServiceType = useArchiveServiceType(organizationId);
  const [form, setForm] = useState(emptyForm);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 3) {
      toast.error("Informe o nome do tipo de serviço.");
      return;
    }
    try {
      await saveServiceType.mutateAsync({
        id: form.id || undefined,
        values: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          default_days: form.default_days ? Number(form.default_days) : null,
          default_value: form.default_value ? Number(form.default_value.replace(",", ".")) : null,
          is_active: true,
          default_checklist: form.checklist
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      setForm(emptyForm);
      toast.success(form.id ? "Tipo de serviço atualizado." : "Tipo de serviço criado.");
    } catch (error) {
      toast.error(describeError(error, "tipo de serviço"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="page-title">Configurações</h1>
        <p className="page-subtitle">
          Catálogo operacional de {organizationName ?? "sua empresa"}: prazos padrão, valores e checklists reutilizáveis.
        </p>
      </header>

      {!permissions.canManageServiceTypes && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" aria-hidden />
            Seu perfil pode consultar o catálogo, mas não alterá-lo.
          </CardContent>
        </Card>
      )}

      {permissions.canManageServiceTypes && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="section-title">{form.id ? "Editar tipo de serviço" : "Novo tipo de serviço"}</h2>
            <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="st-name">Nome</Label>
                <Input
                  id="st-name"
                  maxLength={120}
                  value={form.name}
                  placeholder="Ex.: Registro de produto"
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-days">Prazo padrão (dias)</Label>
                <Input
                  id="st-days"
                  inputMode="numeric"
                  value={form.default_days}
                  onChange={(event) => setForm({ ...form, default_days: event.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-value">Valor padrão (R$)</Label>
                <Input
                  id="st-value"
                  inputMode="decimal"
                  value={form.default_value}
                  onChange={(event) => setForm({ ...form, default_value: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="st-description">Descrição</Label>
                <Input
                  id="st-description"
                  maxLength={240}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="st-checklist">Checklist padrão (um item por linha)</Label>
                <Textarea
                  id="st-checklist"
                  rows={4}
                  value={form.checklist}
                  placeholder={"Coletar documentos\nConferir dados cadastrais\nProtocolar no órgão"}
                  onChange={(event) => setForm({ ...form, checklist: event.target.value })}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={saveServiceType.isPending}>
                  {saveServiceType.isPending ? "Salvando…" : form.id ? "Salvar alterações" : "Criar tipo de serviço"}
                </Button>
                {form.id && (
                  <Button type="button" variant="ghost" onClick={() => setForm(emptyForm)}>
                    Cancelar edição
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {serviceTypes.isLoading ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-12 w-full" />
              ))}
            </div>
          ) : (serviceTypes.data ?? []).length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Nenhum tipo de serviço cadastrado"
              description="Cadastre os serviços recorrentes para padronizar prazos e checklists dos processos."
            />
          ) : (
            <ul className="divide-y divide-border">
              {(serviceTypes.data ?? []).map((type) => (
                <li key={type.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{type.name}</p>
                    <p className="helper-text mt-0.5 truncate">
                      {type.default_days ? `${type.default_days} dias` : "Sem prazo padrão"}
                      {" · "}
                      {(type.default_checklist ?? []).length} itens de checklist
                      {type.description ? ` · ${type.description}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      label={type.is_active ? "Ativo" : "Inativo"}
                      tone={type.is_active ? "success" : "neutral"}
                    />
                    {permissions.canManageServiceTypes && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setForm({
                              id: type.id,
                              name: type.name,
                              description: type.description ?? "",
                              default_days: type.default_days ? String(type.default_days) : "",
                              default_value: type.default_value ? String(type.default_value) : "",
                              checklist: (type.default_checklist ?? []).join("\n"),
                            })
                          }
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await archiveServiceType.mutateAsync({ id: type.id, active: !type.is_active });
                              toast.success(type.is_active ? "Tipo desativado." : "Tipo reativado.");
                            } catch (error) {
                              toast.error(describeError(error, "tipo de serviço"));
                            }
                          }}
                        >
                          {type.is_active ? "Desativar" : "Reativar"}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
