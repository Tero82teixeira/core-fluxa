import { type ReactNode, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  Copy,
  FileText,
  FolderKanban,
  History,
  Link2,
  Loader2,
  ListTodo,
  LockKeyhole,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  useCancelClientPortalInvitation,
  useClientPortal,
  useCreateClientPortalInvitation,
  useSetClientPortalAccessActive,
} from "@/hooks/use-client-portal";
import {
  useClientPortalShareManagement,
  useClientPortalProcessTimelineManagement,
  useSetClientPortalProcessMovementShared,
  useSetClientPortalItemShared,
  type ClientPortalShareItem,
} from "@/hooks/use-client-portal-content";
import {
  useClientPortalCommunicationManagement,
  useSetClientPortalCommunicationShared,
  type ClientPortalCommunicationManagementRow,
} from "@/hooks/use-client-portal-communication";
import {
  useCreateClientPortalDocumentRequest,
  useManageClientPortalDocumentRequests,
  useReviewClientPortalDocumentRequest,
  useSetClientPortalDocumentRequestStatus,
  type ClientPortalDocumentRequest,
  type ClientPortalRequestStatus,
} from "@/hooks/use-client-portal-requests";
import { describeClientPortalError, effectivePortalInvitationStatus } from "@/lib/client-portal";
import type { CommunicationStatus } from "@/lib/communication";
import { PROCESS_STAGE, type ProcessStage } from "@/lib/domain";
import { DOCUMENT_STATUS, type DocumentStatus } from "@/lib/documents";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";

const STATUS = {
  pending: { label: "Pendente", tone: "warning" as const },
  accepted: { label: "Aceito", tone: "success" as const },
  expired: { label: "Expirado", tone: "neutral" as const },
  cancelled: { label: "Cancelado", tone: "neutral" as const },
};

const REQUEST_STATUS: Record<ClientPortalRequestStatus, { label: string; tone: "warning" | "info" | "success" | "neutral" | "danger" }> = {
  pending: { label: "Aguardando cliente", tone: "warning" },
  submitted: { label: "Aguardando análise", tone: "info" },
  revision_requested: { label: "Correção solicitada", tone: "danger" },
  completed: { label: "Aprovada", tone: "success" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

const COMMUNICATION_STATUS: Record<
  CommunicationStatus,
  { label: string; tone: "warning" | "info" | "success" | "neutral" }
> = {
  aberta: { label: "Aberta", tone: "info" },
  aguardando_cliente: { label: "Aguardando cliente", tone: "warning" },
  aguardando_equipe: { label: "Aguardando equipe", tone: "warning" },
  resolvida: { label: "Resolvida", tone: "success" },
  arquivada: { label: "Arquivada", tone: "neutral" },
};

export function ClientPortalPanel({
  organizationId,
  clientId,
  clientEmail,
}: {
  organizationId: string;
  clientId: string;
  clientEmail: string | null;
}) {
  const portal = useClientPortal(organizationId, clientId, true);
  const createInvitation = useCreateClientPortalInvitation(organizationId, clientId);
  const cancelInvitation = useCancelClientPortalInvitation(organizationId, clientId);
  const setAccessActive = useSetClientPortalAccessActive(organizationId, clientId);
  const shares = useClientPortalShareManagement(organizationId, clientId);
  const setItemShared = useSetClientPortalItemShared(organizationId, clientId);
  const communication = useClientPortalCommunicationManagement(organizationId, clientId);
  const setCommunicationShared = useSetClientPortalCommunicationShared(
    organizationId,
    clientId,
  );
  const requests = useManageClientPortalDocumentRequests(organizationId, clientId);
  const createRequest = useCreateClientPortalDocumentRequest(organizationId, clientId);
  const setRequestStatus = useSetClientPortalDocumentRequestStatus(organizationId, clientId);
  const reviewRequest = useReviewClientPortalDocumentRequest(organizationId, clientId);
  const [email, setEmail] = useState(clientEmail ?? "");
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestDueDate, setRequestDueDate] = useState("");
  const [requestProcessId, setRequestProcessId] = useState("none");
  const [correctionRequest, setCorrectionRequest] = useState<ClientPortalDocumentRequest | null>(null);
  const [correctionFeedback, setCorrectionFeedback] = useState("");

  async function create() {
    try {
      const result = await createInvitation.mutateAsync(email);
      setFreshLink(result.url);
      setCopied(false);
      toast.success("Convite criado. Copie o link e envie ao cliente.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function copy() {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink);
      setCopied(true);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link manualmente.");
    }
  }

  async function cancel(invitationId: string) {
    try {
      await cancelInvitation.mutateAsync(invitationId);
      if (portal.data?.invitations[0]?.id === invitationId) setFreshLink(null);
      toast.success("Convite cancelado.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function toggleAccess(accessId: string, active: boolean) {
    try {
      await setAccessActive.mutateAsync({ accessId, active });
      toast.success(active ? "Acesso reativado." : "Acesso desativado.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function toggleItem(item: ClientPortalShareItem, shared: boolean) {
    try {
      await setItemShared.mutateAsync({
        itemType: item.item_type,
        itemId: item.item_id,
        shared,
      });
      toast.success(shared ? "Item liberado no portal." : "Item removido do portal.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function submitRequest() {
    try {
      await createRequest.mutateAsync({
        title: requestTitle,
        description: requestDescription.trim() || null,
        dueDate: requestDueDate || null,
        processId: requestProcessId === "none" ? null : requestProcessId,
      });
      setRequestTitle("");
      setRequestDescription("");
      setRequestDueDate("");
      setRequestProcessId("none");
      toast.success("Solicitação enviada ao Meu Portal.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function changeRequestStatus(
    request: ClientPortalDocumentRequest,
    status: "completed" | "cancelled",
  ) {
    try {
      await setRequestStatus.mutateAsync({ requestId: request.request_id, status });
      toast.success(status === "completed" ? "Solicitação concluída." : "Solicitação cancelada.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function approveRequest(request: ClientPortalDocumentRequest) {
    try {
      await reviewRequest.mutateAsync({
        requestId: request.request_id,
        decision: "completed",
        feedback: null,
      });
      toast.success("Documento aprovado e cliente notificado.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function requestCorrection() {
    if (!correctionRequest || !correctionFeedback.trim()) return;
    try {
      await reviewRequest.mutateAsync({
        requestId: correctionRequest.request_id,
        decision: "revision_requested",
        feedback: correctionFeedback.trim(),
      });
      setCorrectionRequest(null);
      setCorrectionFeedback("");
      toast.success("Correção solicitada e cliente notificado.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function toggleCommunication(
    thread: ClientPortalCommunicationManagementRow,
    shared: boolean,
  ) {
    try {
      await setCommunicationShared.mutateAsync({ threadId: thread.thread_id, shared });
      toast.success(
        shared ? "Conversa liberada no portal." : "Conversa removida do portal.",
      );
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">Convidar para o Portal do Cliente</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                O cliente cria a própria conta pelo link. Esse acesso não ocupa vaga da equipe e não
                libera os módulos internos da empresa.
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="portal-client-email">E-mail do cliente</Label>
              <Input
                id="portal-client-email"
                type="email"
                placeholder="cliente@exemplo.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <Button
              onClick={() => void create()}
              disabled={!email.trim() || createInvitation.isPending}
            >
              {createInvitation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="size-4" aria-hidden />
              )}
              Gerar convite
            </Button>
          </div>

          {freshLink && (
            <div className="rounded-lg border border-success/25 bg-success/5 p-4">
              <p className="text-sm font-medium">Link pronto para compartilhar</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  readOnly
                  value={freshLink}
                  aria-label="Link do convite do Portal do Cliente"
                />
                <Button variant="outline" onClick={() => void copy()}>
                  {copied ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {copied ? "Copiado" : "Copiar link"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Por segurança, o link completo aparece somente agora. Gere outro se precisar.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {portal.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : portal.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Não foi possível carregar os convites e acessos do cliente.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <UserRoundCheck className="size-4 text-primary" aria-hidden />
                <h2 className="font-semibold">Acessos</h2>
              </div>
              {(portal.data?.accesses.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Nenhum cliente aceitou um convite ainda.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {portal.data?.accesses.map((access) => (
                    <li key={access.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{access.email}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Aceito em {formatDateTime(access.accepted_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge
                          label={access.is_active ? "Ativo" : "Desativado"}
                          tone={access.is_active ? "success" : "neutral"}
                        />
                        <Switch
                          checked={access.is_active}
                          disabled={setAccessActive.isPending}
                          aria-label={`${access.is_active ? "Desativar" : "Reativar"} acesso de ${access.email}`}
                          onCheckedChange={(active) => void toggleAccess(access.id, active)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="font-semibold">Histórico de convites</h2>
              {(portal.data?.invitations.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Nenhum convite criado.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {portal.data?.invitations.map((invitation) => {
                    const status = effectivePortalInvitationStatus(
                      invitation.status,
                      invitation.expires_at,
                    );
                    return (
                      <li
                        key={invitation.id}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{invitation.email}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Criado em {formatDateTime(invitation.created_at)} · expira em{" "}
                            {formatDateTime(invitation.expires_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge label={STATUS[status].label} tone={STATUS[status].tone} />
                          {status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cancelInvitation.isPending}
                              onClick={() => void cancel(invitation.id)}
                            >
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ListTodo className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">Solicitações de documentos</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Peça um arquivo ao cliente. Ele verá a pendência e poderá enviá-lo pelo portal seguro.
              </p>
            </div>
          </div>

          <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="portal-request-title">Documento solicitado</Label>
              <Input
                id="portal-request-title"
                placeholder="Ex.: Comprovante de endereço atualizado"
                value={requestTitle}
                maxLength={160}
                onChange={(event) => setRequestTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="portal-request-description">Orientações (opcional)</Label>
              <Textarea
                id="portal-request-description"
                placeholder="Informe período, dados necessários ou outra orientação."
                value={requestDescription}
                maxLength={2000}
                onChange={(event) => setRequestDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-request-process">Processo (opcional)</Label>
              <Select value={requestProcessId} onValueChange={setRequestProcessId}>
                <SelectTrigger id="portal-request-process"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem processo</SelectItem>
                  {(shares.data ?? []).filter((item) => item.item_type === "process").map((item) => (
                    <SelectItem key={item.item_id} value={item.item_id}>
                      {item.subtitle} · {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-request-due-date">Prazo (opcional)</Label>
              <Input
                id="portal-request-due-date"
                type="date"
                value={requestDueDate}
                onChange={(event) => setRequestDueDate(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2 sm:flex sm:justify-end">
              <Button
                onClick={() => void submitRequest()}
                disabled={!requestTitle.trim() || createRequest.isPending}
              >
                {createRequest.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ListTodo className="size-4" aria-hidden />}
                Criar solicitação
              </Button>
            </div>
          </div>

          {requests.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : requests.isError ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar as solicitações.
            </div>
          ) : (requests.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma solicitação criada para este cliente.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border">
              {requests.data?.map((request) => (
                <li key={request.request_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{request.title}</p>
                      <StatusBadge label={REQUEST_STATUS[request.status].label} tone={REQUEST_STATUS[request.status].tone} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {request.process_code ? `${request.process_code} · ` : ""}
                      {request.due_date ? `Prazo: ${formatDate(request.due_date)}` : "Sem prazo"}
                      {request.submitted_file_name ? ` · ${request.submitted_file_name}` : ""}
                      {request.submission_count > 0 ? ` · ${request.submission_count} envio(s)` : ""}
                    </p>
                    {request.company_feedback && (
                      <div className="mt-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                        <span className="font-medium">Último retorno: </span>
                        <span className="whitespace-pre-wrap">{request.company_feedback}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {request.status === "pending" && (
                      <Button variant="outline" size="sm" disabled={setRequestStatus.isPending} onClick={() => void changeRequestStatus(request, "cancelled")}>Cancelar</Button>
                    )}
                    {request.status === "submitted" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={reviewRequest.isPending}
                          onClick={() => {
                            setCorrectionRequest(request);
                            setCorrectionFeedback("");
                          }}
                        >
                          <RotateCcw className="size-4" aria-hidden /> Pedir correção
                        </Button>
                        <Button size="sm" disabled={reviewRequest.isPending} onClick={() => void approveRequest(request)}>
                          <Check className="size-4" aria-hidden /> Aprovar
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(correctionRequest)}
        onOpenChange={(open) => {
          if (!open && !reviewRequest.isPending) {
            setCorrectionRequest(null);
            setCorrectionFeedback("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar correção</DialogTitle>
            <DialogDescription>
              Explique ao cliente exatamente o que precisa ser ajustado antes do reenvio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="portal-request-correction">Orientação para o cliente</Label>
            <Textarea
              id="portal-request-correction"
              value={correctionFeedback}
              maxLength={2000}
              rows={5}
              placeholder="Ex.: envie o documento completo, com todas as páginas legíveis."
              onChange={(event) => setCorrectionFeedback(event.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">
              {correctionFeedback.length}/2000
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={reviewRequest.isPending}
              onClick={() => setCorrectionRequest(null)}
            >
              Voltar
            </Button>
            <Button
              disabled={!correctionFeedback.trim() || reviewRequest.isPending}
              onClick={() => void requestCorrection()}
            >
              {reviewRequest.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="size-4" aria-hidden />
              )}
              Solicitar correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <MessageSquare className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">Conversas visíveis no portal</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Libere somente conversas adequadas ao cliente. Notas internas nunca aparecem.
                </p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link to="/comunicacao">
                <MessageSquare className="size-4" aria-hidden />
                Abrir Comunicação
              </Link>
            </Button>
          </div>

          {communication.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : communication.isError ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar as conversas deste cliente.
            </div>
          ) : (communication.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma conversa interna foi criada para este cliente. Crie uma na Central de
              Comunicação ou aguarde o cliente iniciar pelo portal.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border">
              {communication.data?.map((thread) => {
                const status = COMMUNICATION_STATUS[thread.status];
                return (
                  <li key={thread.thread_id} className="flex items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{thread.subject}</p>
                        <StatusBadge label={status.label} tone={status.tone} />
                        {thread.opened_by_client && (
                          <StatusBadge label="Iniciada pelo cliente" tone="info" />
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Atualizada em {formatDateTime(thread.updated_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {thread.is_shared ? "Visível" : "Privada"}
                      </span>
                      <Switch
                        checked={thread.is_shared}
                        disabled={setCommunicationShared.isPending}
                        aria-label={
                          (thread.is_shared ? "Remover " : "Liberar ") +
                          "conversa " +
                          thread.subject +
                          " no portal"
                        }
                        onCheckedChange={(shared) =>
                          void toggleCommunication(thread, shared)
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <LockKeyhole className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">Conteúdo visível no portal</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tudo começa privado. Libere somente os processos, documentos e atualizações que
                este cliente pode acompanhar.
              </p>
            </div>
          </div>

          {shares.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : shares.isError ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar os controles de compartilhamento.
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <ShareItems
                title="Processos"
                icon={FolderKanban}
                items={(shares.data ?? []).filter((item) => item.item_type === "process")}
                busy={setItemShared.isPending}
                onToggle={toggleItem}
                renderDetails={(item) =>
                  item.is_shared ? (
                    <ProcessHistorySharing
                      organizationId={organizationId}
                      clientId={clientId}
                      processId={item.item_id}
                    />
                  ) : null
                }
              />
              <ShareItems
                title="Documentos"
                icon={FileText}
                items={(shares.data ?? []).filter((item) => item.item_type === "document")}
                busy={setItemShared.isPending}
                onToggle={toggleItem}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShareItems({
  title,
  icon: Icon,
  items,
  busy,
  onToggle,
  renderDetails,
}: {
  title: string;
  icon: typeof FolderKanban;
  items: ClientPortalShareItem[];
  busy: boolean;
  onToggle: (item: ClientPortalShareItem, shared: boolean) => Promise<void>;
  renderDetails?: (item: ClientPortalShareItem) => ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nenhum item disponível para este cliente.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border">
          {items.map((item) => {
            const status =
              item.item_type === "process"
                ? PROCESS_STAGE[item.status as ProcessStage]?.label
                : DOCUMENT_STATUS[item.status as DocumentStatus]?.label;
            return (
              <li key={`${item.item_type}-${item.item_id}`} className="p-4">
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.subtitle}
                      {status ? ` · ${status}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {item.is_shared ? "Visível" : "Privado"}
                    </span>
                    <Switch
                      checked={item.is_shared}
                      disabled={busy}
                      aria-label={`${item.is_shared ? "Remover" : "Liberar"} ${item.title} no portal`}
                      onCheckedChange={(shared) => void onToggle(item, shared)}
                    />
                  </div>
                </div>
                {renderDetails?.(item)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProcessHistorySharing({
  organizationId,
  clientId,
  processId,
}: {
  organizationId: string;
  clientId: string;
  processId: string;
}) {
  const [open, setOpen] = useState(false);
  const timeline = useClientPortalProcessTimelineManagement(
    organizationId,
    clientId,
    processId,
    open,
  );
  const setMovementShared = useSetClientPortalProcessMovementShared(
    organizationId,
    clientId,
    processId,
  );

  async function toggleMovement(movementId: string, shared: boolean) {
    try {
      await setMovementShared.mutateAsync({ movementId, shared });
      toast.success(shared ? "Atualização liberada no portal." : "Atualização removida do portal.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3 border-t pt-3">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-full justify-between px-2">
          <span className="flex items-center gap-2 text-xs">
            <History className="size-3.5 text-primary" aria-hidden />
            Escolher atualizações visíveis
          </span>
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        {timeline.isLoading ? (
          <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Carregando atualizações…
          </p>
        ) : timeline.isError ? (
          <p className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive">
            Não foi possível carregar o histórico deste processo.
          </p>
        ) : (timeline.data?.length ?? 0) === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Nenhuma movimentação registrada neste processo.
          </p>
        ) : (
          <ul className="space-y-2">
            {timeline.data?.map((movement) => (
              <li
                key={movement.movement_id}
                className="flex items-start gap-3 rounded-lg bg-muted/35 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{movement.description}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {movement.from_stage && movement.to_stage
                      ? `${PROCESS_STAGE[movement.from_stage].label} → ${PROCESS_STAGE[movement.to_stage].label} · `
                      : ""}
                    {formatDateTime(movement.occurred_at)}
                  </p>
                </div>
                <Switch
                  checked={movement.is_shared}
                  disabled={setMovementShared.isPending}
                  aria-label={`${movement.is_shared ? "Remover" : "Liberar"} atualização no portal`}
                  onCheckedChange={(shared) =>
                    void toggleMovement(movement.movement_id, shared)
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 px-2 text-[11px] text-muted-foreground">
          Somente as atualizações marcadas como visíveis aparecerão para o cliente.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
