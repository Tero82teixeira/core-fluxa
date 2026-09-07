import { Link } from "@tanstack/react-router";
import { Download, Loader2, MessageSquare, Paperclip, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { QuickReplyPicker } from "@/components/communication/quick-reply-picker";
import { useAddCommunicationEntry } from "@/hooks/use-communication";
import { useCommunicationQuickReplies } from "@/hooks/use-quick-replies";
import {
  openPortalChatAttachment,
  usePortalChatRealtime,
  useUploadPortalChatAttachment,
} from "@/hooks/use-portal-chat";
import {
  useMarkStaffPortalCommunicationRead,
  useStaffPortalEntries,
  useStaffPortalInbox,
} from "@/hooks/use-staff-portal-inbox";
import { canWriteCommunication } from "@/lib/communication";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { applyQuickReply } from "@/lib/quick-replies";
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
  const allowed = status === "ready" && onboardingCompleted && canWriteCommunication(role);
  const inbox = useStaffPortalInbox(organizationId, allowed);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const selected = inbox.data?.find((thread) => thread.thread_id === selectedId) ?? null;
  const entries = useStaffPortalEntries(organizationId, selectedId);
  const addEntry = useAddCommunicationEntry(organizationId);
  const quickReplies = useCommunicationQuickReplies(organizationId, allowed);
  const uploadAttachment = useUploadPortalChatAttachment(organizationId);
  const markRead = useMarkStaffPortalCommunicationRead(organizationId);
  const publicEntries = entries.data ?? [];
  const waitingCount = (inbox.data ?? []).filter(
    (thread) => thread.status === "aguardando_equipe",
  ).length;
  usePortalChatRealtime({
    topic: organizationId ? `staff-org:${organizationId}` : null,
    enabled: allowed,
  });

  useEffect(() => {
    if (!open || inbox.isLoading || (selectedId && selected)) return;
    setSelectedId(inbox.data?.[0]?.thread_id ?? null);
  }, [open, inbox.isLoading, inbox.data, selectedId, selected]);

  useEffect(() => {
    if (!open || !selectedId) return;
    const frame = window.requestAnimationFrame(() => {
      if (timelineRef.current) {
        timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedId, publicEntries]);

  useEffect(() => {
    if (
      !open ||
      !selectedId ||
      markRead.isPending ||
      !publicEntries.some((entry) => entry.author_kind === "client" && !entry.read_at)
    )
      return;
    void markRead.mutateAsync(selectedId);
  }, [open, selectedId, publicEntries, markRead.isPending]);

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

  async function sendAttachment(file: File) {
    if (!selectedId) return;
    try {
      await uploadAttachment.mutateAsync({ threadId: selectedId, file });
      toast.success("Arquivo enviado ao cliente.");
    } catch (error) {
      toast.error(describeError(error, "documento"));
    }
  }

  async function openAttachment(path: string, name: string) {
    try {
      await openPortalChatAttachment(path, name);
    } catch (error) {
      toast.error(describeError(error, "documento"));
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
            <span className="absolute -top-2 right-1 grid h-6 min-w-6 place-items-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm">
              {waitingCount > 99 ? "99+" : waitingCount}
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
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void inbox.refetch()}
              >
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

              <div
                ref={timelineRef}
                className="max-h-56 space-y-2 overflow-y-auto rounded-xl bg-muted/35 p-3"
              >
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
                    return (
                      <div
                        key={entry.entry_id}
                        className={
                          "max-w-[88%] rounded-xl px-3 py-2 text-xs " +
                          (entry.author_kind === "client"
                            ? "border bg-background"
                            : "ml-auto bg-primary text-primary-foreground")
                        }
                      >
                        <p className="whitespace-pre-wrap">{entry.content}</p>
                        {entry.attachment_path && entry.attachment_name && (
                          <button
                            type="button"
                            className="mt-2 flex max-w-full items-center gap-1.5 rounded-lg border border-current/20 px-2 py-1.5 font-medium hover:bg-black/5"
                            onClick={() =>
                              void openAttachment(entry.attachment_path!, entry.attachment_name!)
                            }
                          >
                            <Download className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{entry.attachment_name}</span>
                          </button>
                        )}
                        <p
                          className={
                            "mt-1 text-[10px] " +
                            (entry.author_kind === "client"
                              ? "text-muted-foreground"
                              : "text-primary-foreground/70")
                          }
                        >
                          {entry.author_kind === "client" ? selected?.client_name : "Empresa"} ·{" "}
                          {formatDateTime(entry.occurred_at)}
                          {entry.author_kind === "company" && (
                            <> · {entry.read_at ? "Lida" : "Enviada"}</>
                          )}
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
                <div className="space-y-2">
                  <QuickReplyPicker
                    replies={quickReplies.data ?? []}
                    loading={quickReplies.isLoading}
                    disabled={addEntry.isPending}
                    onSelect={(content) => setReply((current) => applyQuickReply(current, content))}
                  />
                  <div className="flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void sendAttachment(file);
                        event.target.value = "";
                      }}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0"
                      disabled={uploadAttachment.isPending}
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Anexar arquivo"
                    >
                      {uploadAttachment.isPending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Paperclip className="size-4" aria-hidden />
                      )}
                    </Button>
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
