import { BellRing, CalendarClock, Loader2, PhoneCall, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ClientPortalCommunicationThread } from "@/hooks/use-client-portal-communication";
import {
  useCancelClientPortalCallback,
  useClientPortalCallbacks,
  useClientPortalPushNotifications,
  useClientPortalRatings,
  useCreateClientPortalCallback,
  useSubmitClientPortalRating,
} from "@/hooks/use-client-portal-experience";
import type { ClientPortalSessionRow } from "@/hooks/use-client-portal-session";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

const PANEL = "border-primary/10 bg-background/90 shadow-lg shadow-primary/5";
const CALLBACK_STATUS = {
  pending: "Aguardando confirmação",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
} as const;

export function PortalPushPrompt({ enabled }: { enabled: boolean }) {
  const push = useClientPortalPushNotifications(enabled);
  if (!push.supported || push.checking || push.active) return null;
  return (
    <Card className={PANEL}>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <BellRing className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Receba as respostas da empresa</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ative os alertas deste aparelho para saber quando chegar uma nova mensagem.
            </p>
          </div>
        </div>
        <Button
          disabled={push.busy || push.permission === "denied"}
          onClick={async () => {
            try {
              await push.enable();
              toast.success("Alertas ativados neste aparelho.");
            } catch (error) {
              toast.error(describeError(error, "salvar"));
            }
          }}
        >
          {push.busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <BellRing className="size-4" />
          )}{" "}
          {push.permission === "denied" ? "Permissão bloqueada" : "Ativar alertas"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function PortalConversationRating({
  threadId,
  identityScope,
}: {
  threadId: string;
  identityScope: string | null;
}) {
  const ratings = useClientPortalRatings(Boolean(identityScope), identityScope);
  const submit = useSubmitClientPortalRating(identityScope);
  const saved = ratings.data?.find((item) => item.thread_id === threadId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const value = rating || saved?.rating || 0;
  return (
    <div className="space-y-3 rounded-xl border border-primary/15 bg-primary/5 p-4">
      <div>
        <p className="font-medium">Como foi este atendimento?</p>
        <p className="text-xs text-muted-foreground">Sua avaliação ajuda a empresa a melhorar.</p>
      </div>
      <div className="flex gap-1" aria-label="Avaliação de uma a cinco estrelas">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
            onClick={() => setRating(star)}
            className="rounded p-1 hover:bg-primary/10"
          >
            <Star
              className={`size-6 ${star <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
            />
          </button>
        ))}
      </div>
      <Textarea
        rows={2}
        maxLength={1000}
        value={comment || (rating ? "" : (saved?.comment ?? ""))}
        placeholder="Comentário opcional"
        onChange={(event) => setComment(event.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {saved ? "Você já avaliou e pode atualizar a nota." : "Escolha de 1 a 5 estrelas."}
        </span>
        <Button
          size="sm"
          disabled={!value || submit.isPending}
          onClick={async () => {
            try {
              await submit.mutateAsync({
                threadId,
                rating: value,
                comment: comment || saved?.comment || "",
              });
              setRating(0);
              setComment("");
              toast.success("Avaliação enviada. Obrigado!");
            } catch (error) {
              toast.error(describeError(error, "salvar"));
            }
          }}
        >
          {submit.isPending && <Loader2 className="size-4 animate-spin" />}{" "}
          {saved ? "Atualizar avaliação" : "Enviar avaliação"}
        </Button>
      </div>
    </div>
  );
}

export function PortalCallbackCenter({
  accesses,
  threads,
  identityScope,
}: {
  accesses: ClientPortalSessionRow[];
  threads: ClientPortalCommunicationThread[];
  identityScope: string | null;
}) {
  const callbacks = useClientPortalCallbacks(Boolean(identityScope), identityScope);
  const create = useCreateClientPortalCallback(identityScope);
  const cancel = useCancelClientPortalCallback(identityScope);
  const [accessId, setAccessId] = useState(accesses[0]?.access_id ?? "");
  const [threadId, setThreadId] = useState("none");
  const [requestedFor, setRequestedFor] = useState("");
  const [reason, setReason] = useState("");
  const availableThreads = useMemo(
    () => threads.filter((thread) => thread.access_id === accessId),
    [accessId, threads],
  );
  const minimum = useMemo(() => {
    const date = new Date(Date.now() + 15 * 60 * 1000);
    date.setSeconds(0, 0);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }, []);
  return (
    <Card className={PANEL}>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <PhoneCall className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Pedir um retorno</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha o melhor dia e horário. O responsável receberá uma tarefa e um lembrete.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {accesses.length > 1 && (
            <div className="space-y-2">
              <Label>Empresa e cliente</Label>
              <Select
                value={accessId}
                onValueChange={(value) => {
                  setAccessId(value);
                  setThreadId("none");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accesses.map((access) => (
                    <SelectItem key={access.access_id} value={access.access_id}>
                      {access.client_name} · {access.organization_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Conversa relacionada</Label>
            <Select value={threadId} onValueChange={setThreadId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Assunto geral</SelectItem>
                {availableThreads.map((thread) => (
                  <SelectItem key={thread.thread_id} value={thread.thread_id}>
                    {thread.subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-callback-date">Dia e horário</Label>
            <Input
              id="portal-callback-date"
              type="datetime-local"
              min={minimum}
              value={requestedFor}
              onChange={(event) => setRequestedFor(event.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="portal-callback-reason">Motivo</Label>
            <Textarea
              id="portal-callback-reason"
              rows={2}
              maxLength={1000}
              value={reason}
              placeholder="Explique brevemente sobre o que deseja conversar."
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={!accessId || !requestedFor || reason.trim().length < 3 || create.isPending}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  accessId,
                  threadId: threadId === "none" ? null : threadId,
                  requestedFor: new Date(requestedFor).toISOString(),
                  reason: reason.trim(),
                });
                setRequestedFor("");
                setReason("");
                setThreadId("none");
                toast.success("Pedido de retorno enviado.");
              } catch (error) {
                toast.error(describeError(error, "salvar"));
              }
            }}
          >
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarClock className="size-4" />
            )}{" "}
            Solicitar retorno
          </Button>
        </div>
        {(callbacks.data?.length ?? 0) > 0 && (
          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Meus pedidos</h3>
            {callbacks.data?.map((request) => (
              <div
                key={request.request_id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {formatDateTime(request.requested_for)} · {CALLBACK_STATUS[request.status]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{request.reason}</p>
                  {request.staff_notes && (
                    <p className="mt-1 text-xs">Empresa: {request.staff_notes}</p>
                  )}
                </div>
                {request.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancel.isPending}
                    onClick={async () => {
                      try {
                        await cancel.mutateAsync(request.request_id);
                        toast.success("Pedido cancelado.");
                      } catch (error) {
                        toast.error(describeError(error, "salvar"));
                      }
                    }}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
