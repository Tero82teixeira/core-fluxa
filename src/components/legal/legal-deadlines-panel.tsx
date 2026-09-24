import { useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useLegalDeadlines,
  useSaveLegalDeadline,
  type LegalDeadline,
} from "@/hooks/use-legal-cases";
import { describeError } from "@/lib/errors";

export function LegalDeadlinesPanel({
  organizationId,
  processId,
  canEdit,
}: {
  organizationId: string | null;
  processId: string;
  canEdit: boolean;
}) {
  const deadlines = useLegalDeadlines(organizationId, { processId });
  const save = useSaveLegalDeadline(organizationId, processId);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [editing, setEditing] = useState<LegalDeadline | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !dueDate) return;
    try {
      await save.mutateAsync({
        id: editing?.id,
        title: title.trim(),
        dueDate,
        status: editing?.status ?? "aberto",
      });
      setTitle("");
      setDueDate("");
      setEditing(null);
      toast.success(editing ? "Prazo atualizado." : "Prazo registrado.");
    } catch (error) {
      toast.error(describeError(error, "processo"));
    }
  }

  async function setStatus(deadline: LegalDeadline, status: LegalDeadline["status"]) {
    try {
      await save.mutateAsync({
        id: deadline.id,
        title: deadline.title,
        dueDate: deadline.due_date,
        status,
      });
      toast.success(status === "concluido" ? "Prazo concluído." : "Prazo reaberto.");
    } catch (error) {
      toast.error(describeError(error, "processo"));
    }
  }

  return (
    <Card className="rounded-2xl border-amber-500/20 shadow-soft">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarClock className="size-4 text-amber-600" aria-hidden /> Prazos do processo
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre as datas definidas pela equipe. Confira cada prazo antes de salvar.
          </p>
        </div>

        {deadlines.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando prazos…</p>
        ) : deadlines.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar os prazos.</p>
        ) : deadlines.data?.length ? (
          <ul className="divide-y rounded-xl border">
            {deadlines.data.map((deadline) => (
              <li key={deadline.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{deadline.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
                      new Date(`${deadline.due_date}T12:00:00Z`),
                    )}{" "}
                    ·{" "}
                    {deadline.status === "aberto"
                      ? "Aberto"
                      : deadline.status === "concluido"
                        ? "Concluído"
                        : "Cancelado"}
                  </p>
                </div>
                {canEdit && deadline.status !== "cancelado" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={save.isPending}
                      onClick={() => {
                        setEditing(deadline);
                        setTitle(deadline.title);
                        setDueDate(deadline.due_date);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={save.isPending}
                      onClick={() =>
                        setStatus(deadline, deadline.status === "aberto" ? "concluido" : "aberto")
                      }
                    >
                      {deadline.status === "aberto" ? "Concluir" : "Reabrir"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum prazo cadastrado.</p>
        )}

        {canEdit && (
          <form
            onSubmit={submit}
            className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_11rem_auto] sm:items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor="legal-deadline-title">Descrição do prazo</Label>
              <Input
                id="legal-deadline-title"
                maxLength={160}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: apresentar manifestação"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="legal-deadline-date">Data</Label>
              <Input
                id="legal-deadline-date"
                type="date"
                required
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={save.isPending || !title.trim() || !dueDate}>
              {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {editing ? "Salvar prazo" : "Adicionar prazo"}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => {
                  setEditing(null);
                  setTitle("");
                  setDueDate("");
                }}
              >
                Cancelar edição
              </Button>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
