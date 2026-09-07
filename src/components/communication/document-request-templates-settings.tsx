import { FileStack, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useDocumentRequestTemplates,
  useSaveDocumentRequestTemplate,
  type DocumentRequestTemplate,
} from "@/hooks/use-document-request-templates";
import { describeError } from "@/lib/errors";

const empty = { id: null as string | null, title: "", documents: "", dueDays: 7, isActive: true };
export function DocumentRequestTemplatesSettings({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const query = useDocumentRequestTemplates(organizationId, canManage);
  const save = useSaveDocumentRequestTemplate(organizationId);
  const [form, setForm] = useState(empty);
  if (!canManage) return null;
  const edit = (template: DocumentRequestTemplate) =>
    setForm({
      id: template.id,
      title: template.title,
      documents: template.items.map((item) => item.title).join("\n"),
      dueDays: template.items[0]?.due_days ?? 7,
      isActive: template.is_active,
    });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const titles = form.documents
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (form.title.trim().length < 2) return toast.error("Informe o nome do modelo.");
    if (titles.length < 1 || titles.length > 20)
      return toast.error("Informe de 1 a 20 documentos, um por linha.");
    try {
      await save.mutateAsync({
        id: form.id,
        title: form.title,
        isActive: form.isActive,
        items: titles.map((title) => ({ title, description: "", due_days: form.dueDays })),
      });
      toast.success(form.id ? "Modelo atualizado." : "Modelo criado.");
      setForm(empty);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileStack className="size-4 text-primary" />
              Modelos de solicitação de documentos
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie várias pendências de uma vez no portal do cliente.
            </p>
          </div>
          {form.id && (
            <Button variant="outline" size="sm" onClick={() => setForm(empty)}>
              <X className="size-4" />
              Cancelar edição
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <form
          className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2"
          onSubmit={submit}
        >
          <div className="space-y-1.5">
            <Label htmlFor="template-title">Nome do modelo</Label>
            <Input
              id="template-title"
              maxLength={80}
              value={form.title}
              placeholder="Ex.: Admissão de cliente"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template-due">Prazo padrão (dias)</Label>
            <Input
              id="template-due"
              type="number"
              min={0}
              max={365}
              value={form.dueDays}
              onChange={(e) => setForm({ ...form, dueDays: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="template-documents">Documentos — um por linha</Label>
            <Textarea
              id="template-documents"
              rows={5}
              value={form.documents}
              placeholder={"Documento de identificação\nComprovante de endereço\nContrato social"}
              onChange={(e) => setForm({ ...form, documents: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.isActive}
              onCheckedChange={(value) => setForm({ ...form, isActive: value })}
            />
            Disponível para uso
          </label>
          <div className="flex justify-end">
            <Button disabled={save.isPending}>
              {form.id ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {form.id ? "Salvar alterações" : "Criar modelo"}
            </Button>
          </div>
        </form>
        {query.isLoading ? (
          <p className="py-5 text-center text-sm text-muted-foreground">Carregando modelos…</p>
        ) : (query.data?.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            Nenhum modelo cadastrado.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {query.data?.map((template) => (
              <li key={template.id} className="rounded-xl border p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <strong className="text-sm">{template.title}</strong>
                      <Badge variant={template.is_active ? "secondary" : "outline"}>
                        {template.is_active ? "Ativo" : "Pausado"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {template.items.length}{" "}
                      {template.items.length === 1 ? "documento" : "documentos"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${template.title}`}
                    onClick={() => edit(template)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
