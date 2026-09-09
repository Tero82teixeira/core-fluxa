import { CalendarClock, Check, CheckCircle2, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  useStaffPortalCallbacks,
  useUpdateStaffPortalCallback,
} from "@/hooks/use-client-portal-experience";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

const LABEL = {
  pending: "Novo",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
} as const;

export function CallbackRequestsPanel({
  organizationId,
  allowed,
  onOpenCommunication,
}: {
  organizationId: string | null;
  allowed: boolean;
  onOpenCommunication: (threadId: string) => void;
}) {
  const query = useStaffPortalCallbacks(organizationId, allowed);
  const update = useUpdateStaffPortalCallback(organizationId);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const open = (query.data ?? []).filter(
    (request) => request.status === "pending" || request.status === "confirmed",
  );
  if (!allowed || (!query.isLoading && open.length === 0)) return null;
  async function change(requestId: string, status: "confirmed" | "completed" | "cancelled") {
    try {
      await update.mutateAsync({ requestId, status, notes: notes[requestId] });
      toast.success(
        status === "confirmed"
          ? "Retorno confirmado."
          : status === "completed"
            ? "Retorno concluído."
            : "Retorno cancelado.",
      );
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  }
  return (
    <Card className="border-primary/15">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarClock className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Retornos pedidos pelo cliente</h2>
              <p className="text-xs text-muted-foreground">
                Cada pedido já criou uma tarefa para o responsável.
              </p>
            </div>
          </div>
          <Badge>{open.length}</Badge>
        </div>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando pedidos…</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {open.map((request) => (
              <article key={request.request_id} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{request.client_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(request.requested_for)} · {request.assigned_name}
                    </p>
                  </div>
                  <Badge variant={request.status === "pending" ? "default" : "secondary"}>
                    {LABEL[request.status]}
                  </Badge>
                </div>
                <p className="text-sm">{request.reason}</p>
                <Textarea
                  rows={2}
                  maxLength={1000}
                  placeholder="Orientação opcional para o cliente"
                  value={notes[request.request_id] ?? request.staff_notes ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [request.request_id]: event.target.value,
                    }))
                  }
                />
                <div className="flex flex-wrap justify-end gap-2">
                  {request.thread_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenCommunication(request.thread_id!)}
                    >
                      Abrir conversa
                    </Button>
                  )}
                  {request.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => void change(request.request_id, "confirmed")}
                    >
                      <Check className="size-4" /> Confirmar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={update.isPending}
                    onClick={() => void change(request.request_id, "completed")}
                  >
                    {update.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}{" "}
                    Concluir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={update.isPending}
                    onClick={() => void change(request.request_id, "cancelled")}
                  >
                    <X className="size-4" /> Cancelar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
