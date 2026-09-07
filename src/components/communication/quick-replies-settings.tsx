import { MessageSquareText, Pencil, Plus, X } from "lucide-react";
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
  useCommunicationQuickReplies,
  useSaveCommunicationQuickReply,
  type CommunicationQuickReply,
} from "@/hooks/use-quick-replies";
import { describeError } from "@/lib/errors";
import { validateQuickReply } from "@/lib/quick-replies";

const blank = {
  id: null as string | null,
  title: "",
  content: "",
  category: "Geral",
  isActive: true,
};

export function QuickRepliesSettings({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const query = useCommunicationQuickReplies(organizationId, canManage);
  const save = useSaveCommunicationQuickReply(organizationId);
  const [form, setForm] = useState(blank);
  const editing = Boolean(form.id);

  if (!canManage) return null;

  const edit = (reply: CommunicationQuickReply) =>
    setForm({
      id: reply.id,
      title: reply.title,
      content: reply.content,
      category: reply.category,
      isActive: reply.is_active,
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateQuickReply(form);
    if (validation) return toast.error(validation);
    try {
      await save.mutateAsync(form);
      toast.success(editing ? "Resposta rápida atualizada." : "Resposta rápida criada.");
      setForm(blank);
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
              <MessageSquareText className="size-4 text-primary" aria-hidden />
              Respostas rápidas
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie modelos para a equipe inserir e revisar antes de enviar ao cliente.
            </p>
          </div>
          {editing && (
            <Button variant="outline" size="sm" onClick={() => setForm(blank)}>
              <X className="size-4" aria-hidden />
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
            <Label htmlFor="quick-reply-title">Título</Label>
            <Input
              id="quick-reply-title"
              maxLength={80}
              value={form.title}
              placeholder="Ex.: Documento recebido"
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quick-reply-category">Categoria</Label>
            <Input
              id="quick-reply-category"
              maxLength={40}
              value={form.category}
              placeholder="Ex.: Documentos"
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="quick-reply-content">Mensagem</Label>
            <Textarea
              id="quick-reply-content"
              rows={4}
              maxLength={2000}
              value={form.content}
              placeholder="Texto que será inserido para revisão antes do envio."
              onChange={(event) =>
                setForm((current) => ({ ...current, content: event.target.value }))
              }
            />
            <p className="text-right text-xs text-muted-foreground">{form.content.length}/2000</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="quick-reply-active"
              checked={form.isActive}
              onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
            />
            <Label htmlFor="quick-reply-active">Disponível para a equipe</Label>
          </div>
          <div className="flex justify-end">
            <Button disabled={save.isPending}>
              {editing ? (
                <Pencil className="size-4" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              {editing ? "Salvar alterações" : "Criar resposta"}
            </Button>
          </div>
        </form>

        {query.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando respostas…</p>
        ) : query.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            Não foi possível carregar as respostas rápidas.
          </p>
        ) : (query.data?.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma resposta rápida cadastrada.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {query.data?.map((reply) => (
              <li key={reply.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{reply.title}</strong>
                      <Badge variant="outline">{reply.category}</Badge>
                      <Badge variant={reply.is_active ? "secondary" : "outline"}>
                        {reply.is_active ? "Ativa" : "Pausada"}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {reply.content}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${reply.title}`}
                    onClick={() => edit(reply)}
                  >
                    <Pencil className="size-4" aria-hidden />
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
