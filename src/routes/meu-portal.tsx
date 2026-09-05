import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  CalendarDays,
  Download,
  FileText,
  FolderKanban,
  Home,
  ListTodo,
  Loader2,
  LockKeyhole,
  LogOut,
  MessageSquare,
  Send,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddClientPortalCommunicationEntry,
  useClientPortalCommunicationEntries,
  useClientPortalCommunicationThreads,
  useCreateClientPortalCommunicationThread,
} from "@/hooks/use-client-portal-communication";
import {
  createClientPortalDocumentUrl,
  useClientPortalDocuments,
  useClientPortalProcesses,
} from "@/hooks/use-client-portal-content";
import {
  useClientPortalDocumentRequests,
  useSubmitClientPortalDocument,
  type ClientPortalRequestStatus,
} from "@/hooks/use-client-portal-requests";
import {
  useClientPortalSession,
  type ClientPortalSessionRow,
} from "@/hooks/use-client-portal-session";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { CommunicationStatus } from "@/lib/communication";
import { ACCEPT_ATTRIBUTE, DOCUMENT_STATUS, formatFileSize, validateFile } from "@/lib/documents";
import { PROCESS_STAGE } from "@/lib/domain";
import { describeError } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/meu-portal")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/entrar" });
  },
  head: () => ({
    meta: [
      { title: "Meu Portal — FLUXA" },
      { name: "description", content: "Área segura e exclusiva do cliente FLUXA." },
    ],
  }),
  component: MyClientPortal,
});

function MyClientPortal() {
  const navigate = useNavigate();
  const { status, user, signOut, signingOut } = useAuth();
  const session = useClientPortalSession(status === "authenticated");
  const activeAccesses = (session.data ?? []).filter((access) => access.is_active);
  const contentEnabled = status === "authenticated" && activeAccesses.length > 0;
  const processes = useClientPortalProcesses(contentEnabled, user?.id ?? null);
  const documents = useClientPortalDocuments(contentEnabled, user?.id ?? null);
  const requests = useClientPortalDocumentRequests(contentEnabled, user?.id ?? null);
  const communicationThreads = useClientPortalCommunicationThreads(
    contentEnabled,
    user?.id ?? null,
  );
  const createCommunication = useCreateClientPortalCommunicationThread(user?.id ?? null);
  const addCommunicationEntry = useAddClientPortalCommunicationEntry(user?.id ?? null);
  const submitDocument = useSubmitClientPortalDocument(user?.id ?? null);
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);
  const [uploadingRequest, setUploadingRequest] = useState<string | null>(null);
  const [selectedCommunicationId, setSelectedCommunicationId] = useState<string | null>(
    null,
  );
  const communicationEntries = useClientPortalCommunicationEntries(
    selectedCommunicationId,
    user?.id ?? null,
  );
  const [communicationAccessId, setCommunicationAccessId] = useState("");
  const [communicationSubject, setCommunicationSubject] = useState("");
  const [communicationContent, setCommunicationContent] = useState("");
  const [communicationReply, setCommunicationReply] = useState("");
  const selectedCommunication =
    communicationThreads.data?.find(
      (thread) => thread.thread_id === selectedCommunicationId,
    ) ?? null;

  useEffect(() => {
    if (status === "unauthenticated") navigate({ to: "/entrar", replace: true });
  }, [status, navigate]);

  async function openDocument(documentId: string, filePath: string) {
    setOpeningDocument(documentId);
    try {
      const url = await createClientPortalDocumentUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(describeError(error, "documento"));
    } finally {
      setOpeningDocument(null);
    }
  }

  async function uploadRequestedDocument(requestId: string, file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setUploadingRequest(requestId);
    try {
      await submitDocument.mutateAsync({ requestId, file });
      toast.success("Documento enviado com segurança.");
    } catch (error) {
      toast.error(describeError(error, "documento"));
    } finally {
      setUploadingRequest(null);
    }
  }

  async function createConversation() {
    const accessId = communicationAccessId || activeAccesses[0]?.access_id;
    if (!accessId || !communicationSubject.trim() || !communicationContent.trim()) return;
    try {
      const threadId = await createCommunication.mutateAsync({
        accessId,
        subject: communicationSubject.trim(),
        content: communicationContent.trim(),
      });
      setCommunicationSubject("");
      setCommunicationContent("");
      setSelectedCommunicationId(threadId);
      toast.success("Conversa iniciada com a empresa.");
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  }

  async function sendCommunicationReply() {
    if (!selectedCommunicationId || !communicationReply.trim()) return;
    try {
      await addCommunicationEntry.mutateAsync({
        threadId: selectedCommunicationId,
        content: communicationReply.trim(),
      });
      setCommunicationReply("");
      toast.success("Mensagem enviada.");
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  }

  if (status === "initializing" || session.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Preparando seu portal…
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/meu-portal" className="flex items-center gap-2 text-primary">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-display font-semibold leading-none">FLUXA</span>
              <span className="mt-1 block text-xs text-muted-foreground">Meu Portal</span>
            </span>
          </Link>
          <Button variant="outline" size="sm" disabled={signingOut} onClick={() => void signOut()}>
            {signingOut ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <LogOut className="size-4" aria-hidden />
            )}{" "}
            Sair
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <section>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck className="size-4" aria-hidden /> Área exclusiva do cliente
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Bem-vindo ao seu portal
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Conta conectada como {user?.email ?? "cliente"}.
          </p>
        </section>

        {session.isError ? (
          <PortalError retry={() => void session.refetch()} />
        ) : (session.data?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-6">
              <LockKeyhole className="size-8 text-muted-foreground" aria-hidden />
              <h2 className="font-semibold">Acesso ainda não concluído</h2>
              <p className="text-sm text-muted-foreground">
                Abra novamente o link de convite enviado pela empresa para concluir a vinculação.
              </p>
            </CardContent>
          </Card>
        ) : activeAccesses.length === 0 ? (
          <AccessCards accesses={session.data ?? []} />
        ) : (
          <Tabs defaultValue="inicio" className="space-y-6">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1.5 sm:grid-cols-3 lg:grid-cols-6">
              <TabsTrigger value="inicio" className="gap-2 py-2.5">
                <Home className="size-4" aria-hidden /> Início
              </TabsTrigger>
              <TabsTrigger value="processos" className="gap-2 py-2.5">
                <FolderKanban className="size-4" aria-hidden /> Processos
              </TabsTrigger>
              <TabsTrigger value="documentos" className="gap-2 py-2.5">
                <FileText className="size-4" aria-hidden /> Documentos
              </TabsTrigger>
              <TabsTrigger value="pendencias" className="gap-2 py-2.5">
                <ListTodo className="size-4" aria-hidden /> Pendências
              </TabsTrigger>
              <TabsTrigger value="comunicacao" className="gap-2 py-2.5">
                <MessageSquare className="size-4" aria-hidden /> Comunicação
              </TabsTrigger>
              <TabsTrigger value="notificacoes" className="gap-2 py-2.5" disabled>
                <Bell className="size-4" aria-hidden /> Notificações
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inicio" className="space-y-6">
              <AccessCards accesses={session.data ?? []} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                  icon={FolderKanban}
                  label="Processos compartilhados"
                  value={processes.data?.length ?? 0}
                  loading={processes.isLoading}
                />
                <SummaryCard
                  icon={FileText}
                  label="Documentos compartilhados"
                  value={documents.data?.length ?? 0}
                  loading={documents.isLoading}
                />
                <SummaryCard
                  icon={ListTodo}
                  label="Pendências aguardando envio"
                  value={(requests.data ?? []).filter((request) => request.status === "pending").length}
                  loading={requests.isLoading}
                />
                <SummaryCard
                  icon={MessageSquare}
                  label="Conversas com a empresa"
                  value={communicationThreads.data?.length ?? 0}
                  loading={communicationThreads.isLoading}
                />
              </div>
              <div className="rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
                Notificações serão adicionadas na próxima etapa.
              </div>
            </TabsContent>

            <TabsContent value="processos">
              <Card>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <div>
                    <h2 className="font-semibold">Processos compartilhados</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Acompanhe somente os processos liberados pela empresa.
                    </p>
                  </div>
                  {processes.isLoading ? (
                    <LoadingRows />
                  ) : processes.isError ? (
                    <ContentError retry={() => void processes.refetch()} />
                  ) : (processes.data?.length ?? 0) === 0 ? (
                    <EmptyContent
                      icon={FolderKanban}
                      title="Nenhum processo compartilhado"
                      description="Quando a empresa liberar um processo, ele aparecerá aqui."
                    />
                  ) : (
                    <ul className="grid gap-3 md:grid-cols-2">
                      {processes.data?.map((process) => {
                        const access = activeAccesses.find(
                          (item) => item.access_id === process.access_id,
                        );
                        const stage = PROCESS_STAGE[process.stage];
                        return (
                          <li
                            key={`${process.access_id}-${process.process_id}`}
                            className="rounded-xl border bg-background p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-primary">{process.code}</p>
                                <h3 className="mt-1 truncate font-semibold">{process.title}</h3>
                              </div>
                              <StatusBadge
                                label={stage?.label ?? process.stage}
                                tone={stage?.tone ?? "neutral"}
                              />
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <dt className="text-xs text-muted-foreground">Abertura</dt>
                                <dd className="mt-1">{formatDate(process.opened_at)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted-foreground">Prazo</dt>
                                <dd className="mt-1">
                                  {process.due_date ? formatDate(process.due_date) : "Sem prazo"}
                                </dd>
                              </div>
                              {process.protocol && (
                                <div className="col-span-2">
                                  <dt className="text-xs text-muted-foreground">Protocolo</dt>
                                  <dd className="mt-1 break-all">{process.protocol}</dd>
                                </div>
                              )}
                            </dl>
                            {access && <AccessLabel access={access} />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documentos">
              <Card>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <div>
                    <h2 className="font-semibold">Documentos compartilhados</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Abra ou baixe com segurança os arquivos liberados pela empresa.
                    </p>
                  </div>
                  {documents.isLoading ? (
                    <LoadingRows />
                  ) : documents.isError ? (
                    <ContentError retry={() => void documents.refetch()} />
                  ) : (documents.data?.length ?? 0) === 0 ? (
                    <EmptyContent
                      icon={FileText}
                      title="Nenhum documento compartilhado"
                      description="Quando a empresa liberar um documento, ele aparecerá aqui."
                    />
                  ) : (
                    <ul className="space-y-3">
                      {documents.data?.map((document) => {
                        const access = activeAccesses.find(
                          (item) => item.access_id === document.access_id,
                        );
                        const documentStatus = DOCUMENT_STATUS[document.status];
                        return (
                          <li
                            key={`${document.access_id}-${document.document_id}`}
                            className="flex flex-col gap-4 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"
                          >
                            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                              <FileText className="size-5" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate font-semibold">{document.title}</h3>
                                <StatusBadge
                                  label={documentStatus?.label ?? document.status}
                                  tone={documentStatus?.tone ?? "neutral"}
                                />
                              </div>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {document.original_file_name} · {formatFileSize(document.file_size)}
                                {document.process_code ? ` · ${document.process_code}` : ""}
                              </p>
                              {document.expiration_date && (
                                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                  <CalendarDays className="size-3.5" aria-hidden /> Validade:{" "}
                                  {formatDate(document.expiration_date)}
                                </p>
                              )}
                              {access && <AccessLabel access={access} />}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={openingDocument === document.document_id}
                              onClick={() =>
                                void openDocument(document.document_id, document.file_path)
                              }
                            >
                              {openingDocument === document.document_id ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                              ) : (
                                <Download className="size-4" aria-hidden />
                              )}{" "}
                              Abrir
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pendencias">
              <Card>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <div>
                    <h2 className="font-semibold">Documentos solicitados</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Consulte as solicitações da empresa e envie o arquivo correspondente.
                    </p>
                  </div>
                  {requests.isLoading ? (
                    <LoadingRows />
                  ) : requests.isError ? (
                    <ContentError retry={() => void requests.refetch()} />
                  ) : (requests.data?.length ?? 0) === 0 ? (
                    <EmptyContent
                      icon={ListTodo}
                      title="Nenhuma pendência"
                      description="Quando a empresa solicitar um documento, ele aparecerá aqui."
                    />
                  ) : (
                    <ul className="space-y-3">
                      {requests.data?.map((request) => {
                        const requestStatus = PORTAL_REQUEST_STATUS[request.status];
                        const overdue = request.status === "pending" && request.due_date && request.due_date < new Date().toISOString().slice(0, 10);
                        return (
                          <li key={request.request_id} className="rounded-xl border bg-background p-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                <ListTodo className="size-5" aria-hidden />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-semibold">{request.title}</h3>
                                  <StatusBadge label={requestStatus.label} tone={requestStatus.tone} />
                                  {overdue && <StatusBadge label="Prazo vencido" tone="danger" />}
                                </div>
                                {request.description && (
                                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.description}</p>
                                )}
                                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  {request.process_code && <span>Processo {request.process_code}</span>}
                                  <span>{request.due_date ? `Prazo: ${formatDate(request.due_date)}` : "Sem prazo definido"}</span>
                                  {request.submitted_file_name && <span>Enviado: {request.submitted_file_name}</span>}
                                </p>
                                {request.organization_name && request.client_name && (
                                  <p className="mt-2 text-xs text-muted-foreground">{request.client_name} · {request.organization_name}</p>
                                )}
                              </div>
                              {request.status === "pending" && (
                                <label className="shrink-0">
                                  <input
                                    type="file"
                                    accept={ACCEPT_ATTRIBUTE}
                                    className="sr-only"
                                    disabled={uploadingRequest !== null}
                                    onChange={(event) => {
                                      const file = event.currentTarget.files?.[0];
                                      event.currentTarget.value = "";
                                      if (file) void uploadRequestedDocument(request.request_id, file);
                                    }}
                                  />
                                  <span className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 aria-disabled:pointer-events-none aria-disabled:opacity-50" aria-disabled={uploadingRequest !== null}>
                                    {uploadingRequest === request.request_id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
                                    {uploadingRequest === request.request_id ? "Enviando…" : "Enviar arquivo"}
                                  </span>
                                </label>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: PDF, JPG, PNG, DOCX e XLSX, com até 20 MB.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="comunicacao" className="space-y-4">
              <Card>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <div>
                    <h2 className="font-semibold">Iniciar uma conversa</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Envie uma dúvida ou informação diretamente para a empresa.
                    </p>
                  </div>
                  {activeAccesses.length > 1 && (
                    <div className="space-y-2">
                      <Label htmlFor="portal-communication-access">Empresa e cliente</Label>
                      <Select
                        value={communicationAccessId || activeAccesses[0]?.access_id}
                        onValueChange={setCommunicationAccessId}
                      >
                        <SelectTrigger id="portal-communication-access">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccesses.map((access) => (
                            <SelectItem key={access.access_id} value={access.access_id}>
                              {access.client_name} · {access.organization_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="portal-communication-subject">Assunto</Label>
                    <Input
                      id="portal-communication-subject"
                      value={communicationSubject}
                      maxLength={160}
                      placeholder="Ex.: Dúvida sobre meu processo"
                      onChange={(event) => setCommunicationSubject(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="portal-communication-content">Mensagem</Label>
                    <Textarea
                      id="portal-communication-content"
                      value={communicationContent}
                      maxLength={5000}
                      rows={4}
                      placeholder="Escreva sua mensagem para a empresa."
                      onChange={(event) => setCommunicationContent(event.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      disabled={
                        !communicationSubject.trim() ||
                        !communicationContent.trim() ||
                        createCommunication.isPending
                      }
                      onClick={() => void createConversation()}
                    >
                      {createCommunication.isPending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="size-4" aria-hidden />
                      )}
                      Iniciar conversa
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
                <Card>
                  <CardContent className="space-y-4 p-4 sm:p-6">
                    <h2 className="font-semibold">Minhas conversas</h2>
                    {communicationThreads.isLoading ? (
                      <LoadingRows />
                    ) : communicationThreads.isError ? (
                      <ContentError retry={() => void communicationThreads.refetch()} />
                    ) : (communicationThreads.data?.length ?? 0) === 0 ? (
                      <EmptyContent
                        icon={MessageSquare}
                        title="Nenhuma conversa"
                        description="Inicie uma conversa ou aguarde a empresa liberar uma para você."
                      />
                    ) : (
                      <ul className="space-y-2">
                        {communicationThreads.data?.map((thread) => {
                          const threadStatus = PORTAL_COMMUNICATION_STATUS[thread.status];
                          return (
                            <li key={thread.thread_id}>
                              <button
                                type="button"
                                className={
                                  "w-full rounded-lg border p-3 text-left transition-colors " +
                                  (selectedCommunicationId === thread.thread_id
                                    ? "border-primary bg-primary/5"
                                    : "hover:bg-muted/60")
                                }
                                onClick={() => setSelectedCommunicationId(thread.thread_id)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="min-w-0 truncate text-sm font-medium">
                                    {thread.subject}
                                  </p>
                                  <StatusBadge
                                    label={threadStatus.label}
                                    tone={threadStatus.tone}
                                  />
                                </div>
                                {thread.last_message && (
                                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                    {thread.last_message}
                                  </p>
                                )}
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {thread.client_name} · {thread.organization_name}
                                </p>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="space-y-4 p-4 sm:p-6">
                    {!selectedCommunication ? (
                      <EmptyContent
                        icon={MessageSquare}
                        title="Selecione uma conversa"
                        description="Escolha uma conversa para visualizar e responder."
                      />
                    ) : (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                          <div>
                            <h2 className="font-semibold">{selectedCommunication.subject}</h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {selectedCommunication.client_name} ·{" "}
                              {selectedCommunication.organization_name}
                            </p>
                          </div>
                          <StatusBadge
                            label={
                              PORTAL_COMMUNICATION_STATUS[selectedCommunication.status].label
                            }
                            tone={
                              PORTAL_COMMUNICATION_STATUS[selectedCommunication.status].tone
                            }
                          />
                        </div>

                        {communicationEntries.isLoading ? (
                          <LoadingRows />
                        ) : communicationEntries.isError ? (
                          <ContentError retry={() => void communicationEntries.refetch()} />
                        ) : (
                          <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                            {communicationEntries.data?.map((entry) => (
                              <article
                                key={entry.entry_id}
                                className={
                                  "max-w-[88%] rounded-xl p-3 " +
                                  (entry.author_kind === "client"
                                    ? "ml-auto bg-primary text-primary-foreground"
                                    : "border bg-muted/40")
                                }
                              >
                                <p className="whitespace-pre-wrap text-sm">{entry.content}</p>
                                <p
                                  className={
                                    "mt-2 text-xs " +
                                    (entry.author_kind === "client"
                                      ? "text-primary-foreground/75"
                                      : "text-muted-foreground")
                                  }
                                >
                                  {entry.author_kind === "client" ? "Você" : "Empresa"} ·{" "}
                                  {formatDateTime(entry.occurred_at)}
                                </p>
                              </article>
                            ))}
                          </div>
                        )}

                        {selectedCommunication.status === "resolvida" ||
                        selectedCommunication.status === "arquivada" ? (
                          <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                            Esta conversa foi encerrada e está disponível somente para leitura.
                          </p>
                        ) : (
                          <div className="space-y-3 border-t pt-4">
                            <Textarea
                              value={communicationReply}
                              maxLength={5000}
                              rows={3}
                              placeholder="Escreva uma resposta."
                              onChange={(event) => setCommunicationReply(event.target.value)}
                            />
                            <div className="flex justify-end">
                              <Button
                                disabled={
                                  !communicationReply.trim() ||
                                  addCommunicationEntry.isPending
                                }
                                onClick={() => void sendCommunicationReply()}
                              >
                                {addCommunicationEntry.isPending ? (
                                  <Loader2 className="size-4 animate-spin" aria-hidden />
                                ) : (
                                  <Send className="size-4" aria-hidden />
                                )}
                                Enviar mensagem
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-5 text-xs text-muted-foreground">
          <span>Ambiente protegido FLUXA</span>
          <Link to="/termos-de-uso" className="hover:text-foreground hover:underline">
            Termos de Uso
          </Link>
          <Link to="/politica-de-privacidade" className="hover:text-foreground hover:underline">
            Política de Privacidade
          </Link>
        </footer>
      </div>
    </main>
  );
}

const PORTAL_REQUEST_STATUS: Record<
  ClientPortalRequestStatus,
  { label: string; tone: "warning" | "info" | "success" | "neutral" }
> = {
  pending: { label: "Aguardando envio", tone: "warning" },
  submitted: { label: "Enviado", tone: "info" },
  completed: { label: "Concluído", tone: "success" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

const PORTAL_COMMUNICATION_STATUS: Record<
  CommunicationStatus,
  { label: string; tone: "warning" | "info" | "success" | "neutral" }
> = {
  aberta: { label: "Aberta", tone: "info" },
  aguardando_cliente: { label: "Aguardando você", tone: "warning" },
  aguardando_equipe: { label: "Aguardando empresa", tone: "warning" },
  resolvida: { label: "Resolvida", tone: "success" },
  arquivada: { label: "Arquivada", tone: "neutral" },
};

function AccessCards({ accesses }: { accesses: ClientPortalSessionRow[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {accesses.map((access) => (
        <Card key={access.access_id}>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="size-5" aria-hidden />
              </span>
              <StatusBadge
                label={access.is_active ? "Acesso ativo" : "Acesso desativado"}
                tone={access.is_active ? "success" : "danger"}
              />
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Cliente
              </p>
              <h2 className="mt-1 text-lg font-semibold">{access.client_name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{access.organization_name}</p>
            </div>
            {access.is_active ? (
              <p className="rounded-lg border border-success/25 bg-success/5 p-3 text-sm text-muted-foreground">
                Seu vínculo está confirmado. Você verá somente o conteúdo liberado pela empresa.
              </p>
            ) : (
              <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-muted-foreground">
                Este acesso foi desativado. Entre em contato com a empresa para solicitar a
                reativação.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Acesso vinculado em {formatDateTime(access.accepted_at)}
            </p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function AccessLabel({ access }: { access: ClientPortalSessionRow }) {
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      {access.client_name} · {access.organization_name}
    </p>
  );
}
function SummaryCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{loading ? "—" : value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
function LoadingRows() {
  return (
    <div className="grid min-h-32 place-items-center text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando conteúdo…
      </span>
    </div>
  );
}
function ContentError({ retry }: { retry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4">
      <p className="text-sm text-destructive">Não foi possível carregar este conteúdo.</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
        Tentar novamente
      </Button>
    </div>
  );
}
function PortalError({ retry }: { retry: () => void }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <h2 className="font-semibold">Não foi possível carregar seu acesso</h2>
        <p className="text-sm text-muted-foreground">
          Atualize a página. Se o problema continuar, solicite ajuda à empresa responsável.
        </p>
        <Button variant="outline" onClick={retry}>
          Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );
}
function EmptyContent({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FolderKanban;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center">
      <div>
        <Icon className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h3 className="mt-3 font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
