import { Link } from "@tanstack/react-router";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAddCommunicationEntry, useCommunicationEntries } from "@/hooks/use-communication";
import { useStaffPortalInbox } from "@/hooks/use-staff-portal-inbox";
import { canWriteCommunication } from "@/lib/communication";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";

const STATUS_LABELS = {
  aberta: "Aberta",
  aguardando_cliente: "Aguardando cliente",
  aguardando_equipe: "Aguardando equipe",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
};

export function StaffQuickChat() {
  const { organizationId, role, status, onboardingCompleted } = useWorkspace();
  const allowed =
    status === "ready" && onboardingCompleted && canWriteCommunication(role);
  const inbox = useStaffPortalInbox(organizationId, allowed);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const selected = inbox.data?.find((thread) => thread.thread_id === selectedId) ?? null;
  const entries = useCommunicationEntries(selectedId);
  const addEntry = useAddCommunicationEntry(organizationId);
  const publicEntries = useMemo(
    () =>
      (entries.data ?? []).filter(
        (entry) => entry.entry_type === "mensagem" && !entry.is_internal,
      ),
    [entries.data],
  );
  const waitingCount = (inbox.data ?? []).filter(
    (thread) => thread.status === "aguardando_equipe",
  ).length;

  useEffect(() => {
    if (!open || inbox.isLoading || (selectedId && selected)) return;
    setSelectedId(inbox.data?.[0]?.thread_id ?? null);
  }, [open, inbox.isLoading, inbox.data, selectedId, selected]);

  if (!allowed) return null;

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    try {
      await addEntry.mutateAsync({
        threadId: selectedId,
        type: "mensagem",
        content: reply.trim(),
        internal: false,
        contactMade: true,
        metadata: { source: "staff_quick_chat" },
      });
      setReply("");
      await inbox.refetch();
      toast.success("Resposta enviada ao cliente.");
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="lg"
          className="fixed right-4 bottom-5 z-40 size-14 rounded-full shadow-2xl shadow-primary/30 transition-transform hover:scale-105 sm:right-6 sm:w-auto sm:px-5"
          aria-label="Atendimento do Meu Portal"
        >
          <MessageSquare className="size-5" aria-hidden />
          <span className="hidden sm:inline">Atender clientes</span>
          {waitingCount > 0 && (
            <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {waitingCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        className="w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border-primary/15 p-0 shadow-2xl"
      >
        <div className="bg-gradient-to-br from-primary to-primary/80 p-4 text-primary-foreground">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white/15">
                <MessageSquare className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">Atendimento do portal</h2>
                <p className="text-xs text-primary-foreground/75">
                  {waitingCount > 0
                    ? `${waitingCount} aguardando resposta`
                    : "Nenhum cliente aguardando"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {inbox.isLoading ? (
            <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </div>
          ) : inbox.isError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
              <p>Não foi possível carregar os atendimentos.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void inbox.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (inbox.data?.length ?? 0) === 0 ? (
            <div className="py-8 text-center">
              <MessageSquare className="mx-auto size-8 text-muted-foreground/50" aria-hidden />
              <p className="mt-3 text-sm font-medium">Nenhuma conversa do portal</p>
              <p className="mt-1 text-xs text-muted-foreground">
                As mensagens enviadas pelos clientes aparecerão aqui.
              </p>
            </div>
          ) : (
            <>
              <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um atendimento" />
                </SelectTrigger>
                <SelectContent>
                  {inbox.data?.map((thread) => (
                    <SelectItem key={thread.thread_id} value={thread.thread_id}>
                      {thread.client_name} · {thread.subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selected && (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selected.client_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{selected.subject}</p>
                  </div>
                  <span className="shrink-0 rounded-full border bg-muted/50 px-2 py-1 text-[10px] font-medium">
                    {STATUS_LABELS[selected.status]}
                  </span>
                </div>
              )}

              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl bg-muted/35 p-3">
                {entries.isLoading ? (
                  <div className="grid min-h-28 place-items-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                  </div>
                ) : publicEntries.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Nenhuma mensagem pública nesta conversa.
                  </p>
                ) : (
                  publicEntries.map((entry) => {
                    const fromClient = entry.metadata?.source === "client_portal";
                    return (
                      <div
                        key={entry.id}
                        className={
                          "max-w-[88%] rounded-xl px-3 py-2 text-xs " +
                          (fromClient
                            ? "border bg-background"
                            : "ml-auto bg-primary text-primary-foreground")
                        }
                      >
                        <p className="whitespace-pre-wrap">{entry.content}</p>
                        <p
                          className={
                            "mt-1 text-[10px] " +
                            (fromClient
                              ? "text-muted-foreground"
                              : "text-primary-foreground/70")
                          }
                        >
                          {fromClient ? selected?.client_name : "Empresa"} ·{" "}
                          {formatDateTime(entry.occurred_at)}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              {selected?.status === "resolvida" ? (
                <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Esta conversa está resolvida. Reabra na Central de Comunicação para responder.
                </p>
              ) : (
                <div className="flex items-end gap-2">
                  <Textarea
                    value={reply}
                    maxLength={5000}
                    rows={2}
                    className="min-h-16 resize-none"
                    placeholder="Responder ao cliente…"
                    onChange={(event) => setReply(event.target.value)}
                  />
                  <Button
                    size="icon"
                    className="shrink-0"
                    disabled={!reply.trim() || addEntry.isPending}
                    onClick={() => void sendReply()}
                    aria-label="Enviar resposta ao cliente"
                  >
                    {addEntry.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="size-4" aria-hidden />
                    )}
                  </Button>
                </div>
              )}

              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link to="/comunicacao" onClick={() => setOpen(false)}>
                  Abrir Central de Comunicação
                </Link>
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
