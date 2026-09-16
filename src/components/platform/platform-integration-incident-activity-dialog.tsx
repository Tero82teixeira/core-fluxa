import { useState } from "react";
import { History, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  usePlatformAddIntegrationIncidentNote,
  usePlatformIntegrationIncidentActivity,
  type PlatformIntegrationIncident,
} from "@/hooks/use-platform-integration-incidents";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

const activityLabel: Record<string, string> = {
  "platform.integration_incident.acknowledge": "Ocorrência assumida",
  "platform.integration_incident.resolve": "Acompanhamento encerrado",
  "platform.integration_incident.reopen": "Acompanhamento reaberto",
  integration_incident_reopened_automatically: "Reaberto após nova falha",
  integration_incident_resolved_automatically: "Encerrado após recuperação",
};

export function PlatformIntegrationIncidentActivityDialog({
  incident,
}: {
  incident: PlatformIntegrationIncident;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const activity = usePlatformIntegrationIncidentActivity(incident, open);
  const addNote = usePlatformAddIntegrationIncidentNote();

  const saveNote = async () => {
    const cleanNote = note.trim();
    if (cleanNote.length < 2) {
      toast.error("Descreva brevemente o andamento do incidente.");
      return;
    }
    try {
      await addNote.mutateAsync({
        organizationId: incident.organization_id,
        integrationKey: incident.integration_key,
        failureId: incident.failure_id,
        note: cleanNote,
      });
      setNote("");
      toast.success("Nota adicionada ao histórico.");
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <History className="size-4" aria-hidden />
          Histórico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico do incidente</DialogTitle>
          <DialogDescription>
            {incident.organization_name} · {incident.label}. Registre apenas contexto operacional,
            sem credenciais ou conteúdo da empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor={`incident-note-${incident.failure_id}`} className="text-sm font-medium">
            Nova nota operacional
          </label>
          <Textarea
            id={`incident-note-${incident.failure_id}`}
            value={note}
            maxLength={1000}
            rows={3}
            disabled={addNote.isPending}
            placeholder="Ex.: provedor acionado; aguardando confirmação da recuperação."
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{note.length}/1000</span>
            <Button type="button" size="sm" disabled={addNote.isPending} onClick={saveNote}>
              <MessageSquarePlus className="size-4" aria-hidden />
              {addNote.isPending ? "Salvando…" : "Adicionar nota"}
            </Button>
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Atividade</h3>
          {activity.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando histórico…</p>
          )}
          {activity.isError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Não foi possível carregar o histórico deste incidente.
            </p>
          )}
          {!activity.isLoading && !activity.isError && (activity.data ?? []).length === 0 && (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Nenhuma atividade registrada até agora.
            </p>
          )}
          {(activity.data ?? []).map((event) => (
            <div key={event.event_id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {event.event_type === "note"
                    ? "Nota operacional"
                    : (activityLabel[event.event_type] ?? "Atualização do incidente")}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
              </div>
              {event.detail && <p className="mt-2 whitespace-pre-wrap text-sm">{event.detail}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Por {event.actor_name}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
