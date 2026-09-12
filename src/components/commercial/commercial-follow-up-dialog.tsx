import { useEffect, useState } from "react";
import { CalendarClock, Copy, ExternalLink, History, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useCommercialOpportunityContacts,
  usePlatformTrialContactHistory,
  useSaveCommercialOpportunityContact,
  useSavePlatformTrialFollowUp,
} from "@/hooks/use-commercial-follow-up";
import {
  commercialContactChannelLabel,
  commercialFollowUpStatusLabel,
  contactStatusTone,
  whatsappUrl,
  type CommercialContactChannel,
  type CommercialFollowUpStatus,
} from "@/lib/commercial-follow-up";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

type Props = {
  mode: "platform" | "tenant";
  organizationId: string | null;
  targetId: string;
  title: string;
  currentStatus?: CommercialFollowUpStatus | null;
  nextContactAt?: string | null;
  summaryNotes?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  canEdit?: boolean;
  compact?: boolean;
};

const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";

function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CommercialFollowUpDialog({
  mode,
  organizationId,
  targetId,
  title,
  currentStatus = "not_contacted",
  nextContactAt = null,
  summaryNotes = null,
  email = null,
  whatsapp = null,
  phone = null,
  canEdit = true,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CommercialFollowUpStatus>(currentStatus ?? "not_contacted");
  const [channel, setChannel] = useState<CommercialContactChannel>("whatsapp");
  const [notes, setNotes] = useState(summaryNotes ?? "");
  const [nextContact, setNextContact] = useState(localDateTime(nextContactAt));
  const platformHistory = usePlatformTrialContactHistory(targetId, open && mode === "platform");
  const tenantHistory = useCommercialOpportunityContacts(
    organizationId,
    targetId,
    open && mode === "tenant",
  );
  const savePlatform = useSavePlatformTrialFollowUp(targetId);
  const saveTenant = useSaveCommercialOpportunityContact(organizationId, targetId);
  const history = mode === "platform" ? platformHistory : tenantHistory;
  const pending = savePlatform.isPending || saveTenant.isPending;
  const wa = whatsappUrl(whatsapp ?? phone);

  useEffect(() => {
    if (!open) return;
    setStatus(currentStatus ?? "not_contacted");
    setNotes(summaryNotes ?? "");
    setNextContact(localDateTime(nextContactAt));
  }, [currentStatus, nextContactAt, open, summaryNotes]);

  const save = async (registerContact: boolean) => {
    if (registerContact && notes.trim().length < 2) {
      toast.error("Descreva brevemente o contato realizado.");
      return;
    }
    try {
      if (mode === "platform") {
        await savePlatform.mutateAsync({
          status,
          channel,
          notes,
          summaryNotes: notes,
          nextContactAt: nextContact || null,
          registerContact,
        });
      } else {
        await saveTenant.mutateAsync({
          status,
          channel,
          notes,
          nextContactAt: nextContact || null,
        });
      }
      toast.success(registerContact ? "Contato registrado no histórico." : "Acompanhamento salvo.");
      if (registerContact) setNotes("");
      if (mode === "tenant") setOpen(false);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const copyEmail = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      toast.success("E-mail copiado.");
    } catch {
      toast.error("Não foi possível copiar o e-mail.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className={compact ? "px-2" : ""}>
          <CalendarClock className="size-4" aria-hidden />
          {compact ? <span className="sr-only">Acompanhamento de {title}</span> : "Acompanhamento"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Acompanhamento comercial</DialogTitle>
          <DialogDescription>
            {title} · registre o que foi conversado e não perca o próximo contato.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {wa && (
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" aria-hidden /> Abrir WhatsApp
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </Button>
          )}
          {email && (
            <Button type="button" variant="outline" size="sm" onClick={copyEmail}>
              <Copy className="size-4" aria-hidden /> Copiar e-mail
            </Button>
          )}
          {!wa && !email && (
            <p className="text-xs text-muted-foreground">Nenhum contato cadastrado.</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">
            Situação
            <select
              className={selectClass}
              value={status}
              disabled={!canEdit || pending}
              onChange={(event) => setStatus(event.target.value as CommercialFollowUpStatus)}
            >
              {Object.entries(commercialFollowUpStatusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Próximo contato
            <Input
              type="datetime-local"
              value={nextContact}
              disabled={!canEdit || pending}
              onChange={(event) => setNextContact(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Canal do contato
            <select
              className={selectClass}
              value={channel}
              disabled={!canEdit || pending}
              onChange={(event) => setChannel(event.target.value as CommercialContactChannel)}
            >
              {Object.entries(commercialContactChannelLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">
            Observação
            <Textarea
              value={notes}
              maxLength={4000}
              rows={4}
              disabled={!canEdit || pending}
              placeholder="Ex.: apresentou interesse, pediu retorno após conversar com o sócio…"
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>

        {canEdit && (
          <div className="flex flex-wrap justify-end gap-2">
            {mode === "platform" && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void save(false)}
              >
                Salvar acompanhamento
              </Button>
            )}
            <Button
              type="button"
              disabled={pending || notes.trim().length < 2}
              onClick={() => void save(true)}
            >
              {pending ? "Salvando…" : "Registrar contato"}
            </Button>
          </div>
        )}

        <section className="border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" aria-hidden /> Histórico de contatos
          </h3>
          {history.isLoading && (
            <p className="mt-3 text-sm text-muted-foreground">Carregando histórico…</p>
          )}
          {history.isError && (
            <p className="mt-3 text-sm text-destructive">Não foi possível carregar o histórico.</p>
          )}
          {!history.isLoading && !history.isError && !history.data?.length && (
            <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhum contato registrado ainda.
            </p>
          )}
          <div className="mt-3 space-y-3">
            {history.data?.map((entry) => (
              <article key={entry.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={contactStatusTone(entry.status)}>
                      {commercialFollowUpStatusLabel[entry.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {commercialContactChannelLabel[entry.channel]}
                    </span>
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {formatDateTime(entry.contacted_at)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap">{entry.notes}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {entry.created_by_name || "Responsável não identificado"}
                  {entry.next_contact_at
                    ? ` · próximo contato ${formatDateTime(entry.next_contact_at)}`
                    : ""}
                </p>
              </article>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
