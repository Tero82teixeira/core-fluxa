import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace";
import { useContactHistory, useSaveFollowup } from "@/hooks/use-real-estate-followups";
import { CONTACT_CHANNELS, followupError } from "@/lib/real-estate-followups";
import { inquiryError, type Inquiry } from "@/lib/real-estate-inquiries";
import { activityError, localVisitDate, toLocalVisitDate } from "@/lib/real-estate-activity";
import { formatCurrency } from "@/lib/format";
const when = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
export function InquiryFollowupDialog({
  request,
  mode,
  onClose,
}: {
  request: Inquiry;
  mode: "set" | "contact" | "history";
  onClose: () => void;
}) {
  const { organizationId } = useWorkspace();
  const save = useSaveFollowup(organizationId);
  const [page, setPage] = useState(1);
  const history = useContactHistory(mode === "history" ? organizationId : null, request.id, page);
  const [eventId] = useState(() => crypto.randomUUID());
  const [next, setNext] = useState(
    mode === "set" && request.next_contact_at ? toLocalVisitDate(request.next_contact_at) : "",
  );
  const [channel, setChannel] = useState("whatsapp");
  const [note, setNote] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "history"
              ? "Histórico do cliente / contato"
              : mode === "set"
                ? "Próximo retorno"
                : "Registrar resultado da conversa"}
          </DialogTitle>
          <DialogDescription>
            {request.name} · {request.property_code || "Sem imóvel definido"}. Informações internas
            da imobiliária.
          </DialogDescription>
        </DialogHeader>
        {mode === "history" ? (
          <>
            {history.isPending ? (
              <p>Carregando histórico…</p>
            ) : history.isError ? (
              <p role="alert">
                Não foi possível carregar.{" "}
                <Button variant="outline" onClick={() => void history.refetch()}>
                  Tentar novamente
                </Button>
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {history.data.linked
                    ? `Histórico reunido pelo cadastro de ${history.data.client_name || "cliente vinculado"}.`
                    : "Este pedido ainda não está vinculado a um cliente. Exibimos apenas seus registros, sem juntar contatos pelo telefone."}
                </p>
                <div className="space-y-3">
                  {history.data.items.map((item) => (
                    <article
                      key={`${item.kind}-${item.id}`}
                      className="space-y-2 rounded-xl border p-3"
                    >
                      <p className="font-semibold">
                        {
                          (
                            {
                              pedido: "Pedido recebido",
                              interesse: "Imóvel de interesse",
                              visita: "Visita",
                              proposta: "Proposta",
                              contato: "Conversa registrada",
                              retorno: "Planejamento de retorno",
                            } as Record<string, string>
                          )[item.kind]
                        }{" "}
                        · {item.property_code || "Sem imóvel definido"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {when(item.happened_at)} ·{" "}
                        {(
                          {
                            whatsapp: "WhatsApp",
                            telefone: "Telefone",
                            email: "E-mail",
                            presencial: "Presencial",
                            outro: "Outro",
                            planejamento: "Planejamento",
                            novo: "Novo",
                            em_contato: "Em contato",
                            encerrado: "Encerrado",
                            visitando: "Em visitas",
                            agendada: "Agendada",
                            realizada: "Realizada",
                            cancelada: "Cancelada",
                            nao_compareceu: "Não compareceu",
                            aberta: "Aberta",
                            contraproposta: "Contraproposta",
                            aceita: "Aceita",
                            recusada: "Recusada",
                          } as Record<string, string>
                        )[item.status] || item.status}
                      </p>
                      <p className="text-sm">{item.property_title}</p>
                      {item.amount !== null && <p>{formatCurrency(item.amount)}</p>}
                      {item.note && (
                        <p className="whitespace-pre-wrap break-words text-sm">{item.note}</p>
                      )}
                      {item.next_contact_at && (
                        <p className="text-sm">Retorno planejado: {when(item.next_contact_at)}</p>
                      )}
                    </article>
                  ))}
                </div>
                {!history.data.items.length && <p>Nenhum registro.</p>}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    disabled={page === 1 || history.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    Anterior
                  </Button>
                  <span>Página {page}</span>
                  <Button
                    variant="outline"
                    disabled={page * 20 >= history.data.total || history.isFetching}
                    onClick={() => setPage(page + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (save.isPending) return;
              try {
                await save.mutateAsync({
                  action: mode,
                  id: request.id,
                  values: {
                    event_id: eventId,
                    version: request.version,
                    next_contact_at: next ? localVisitDate(next) : null,
                    channel,
                    note,
                  },
                });
                toast.success(
                  mode === "set" ? "Próximo retorno atualizado." : "Conversa registrada.",
                );
                onClose();
              } catch (error) {
                toast.error(followupError(error) || inquiryError(error) || activityError(error));
              }
            }}
          >
            {mode === "contact" && (
              <Label className="block space-y-2">
                Canal
                <select
                  className="h-11 w-full rounded-md border bg-background px-3"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  {Object.entries(CONTACT_CHANNELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Label>
            )}
            <Label className="block space-y-2">
              {mode === "contact" ? "Resultado da conversa" : "Observação (opcional)"}
              <textarea
                className="w-full rounded-md border bg-background p-3"
                required={mode === "contact"}
                maxLength={2000}
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Label>
            <Label className="block space-y-2">
              Próximo retorno (opcional)
              <Input
                disabled={request.status === "encerrado"}
                type="datetime-local"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Label>
            <p className="text-xs text-muted-foreground">
              Deixe o horário vazio para ficar sem próximo retorno. Datas no fuso{" "}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}. Este registro não envia mensagens
              nem cria um agendamento de visita.
            </p>
            <Button disabled={save.isPending}>Salvar</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
