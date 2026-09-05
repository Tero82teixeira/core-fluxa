import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CheckCheck,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  useClientPortalNotifications,
  useMarkAllClientPortalNotificationsRead,
  useMarkClientPortalNotificationRead,
  type ClientPortalNotification,
} from "@/hooks/use-client-portal-notifications";
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
  const notifications = useClientPortalNotifications(contentEnabled, user?.id ?? null);
  const markNotificationRead = useMarkClientPortalNotificationRead(user?.id ?? null);
  const markAllNotificationsRead = useMarkAllClientPortalNotificationsRead(user?.id ?? null);
  const [activeTab, setActiveTab] = useState<PortalTab>("inicio");
  const [highlightedEntity, setHighlightedEntity] = useState<string | null>(null);
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
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [quickNewConversation, setQuickNewConversation] = useState(false);
  const [quickAccessId, setQuickAccessId] = useState("");
  const [quickSubject, setQuickSubject] = useState("");
  const [quickContent, setQuickContent] = useState("");
  const [quickReply, setQuickReply] = useState("");
  const selectedCommunication =
    communicationThreads.data?.find(
      (thread) => thread.thread_id === selectedCommunicationId,
    ) ?? null;
  const unreadNotifications = (notifications.data ?? []).filter(
    (notification) => !notification.read_at,
  ).length;
  const unreadMessages = (notifications.data ?? []).filter(
    (notification) => !notification.read_at && notification.kind === "communication",
  ).length;
  const portalDeadlines: PortalDeadline[] = [
    ...(requests.data ?? [])
      .filter((request) => request.status === "pending" && request.due_date)
      .map((request) => ({
        id: request.request_id,
        entityType: "document_request" as const,
        title: request.title,
        label: "Documento solicitado",
        dueDate: request.due_date as string,
      })),
    ...(processes.data ?? [])
      .filter((process) => process.due_date)
      .map((process) => ({
        id: process.process_id,
        entityType: "process" as const,
        title: process.title,
        label: process.code,
        dueDate: process.due_date as string,
      })),
  ]
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .slice(0, 4);

  useEffect(() => {
    if (status === "unauthenticated") navigate({ to: "/entrar", replace: true });
  }, [status, navigate]);

  useEffect(() => {
    if (!quickChatOpen || selectedCommunicationId || !communicationThreads.data?.[0]) return;
    setSelectedCommunicationId(communicationThreads.data[0].thread_id);
  }, [quickChatOpen, selectedCommunicationId, communicationThreads.data]);

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

  async function createQuickConversation() {
    const accessId = quickAccessId || activeAccesses[0]?.access_id;
    if (!accessId || !quickSubject.trim() || !quickContent.trim()) return;
    try {
      const threadId = await createCommunication.mutateAsync({
        accessId,
        subject: quickSubject.trim(),
        content: quickContent.trim(),
      });
      setQuickSubject("");
      setQuickContent("");
      setSelectedCommunicationId(threadId);
      setQuickNewConversation(false);
      toast.success("Conversa iniciada com a empresa.");
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  }

  async function sendQuickReply() {
    if (!selectedCommunicationId || !quickReply.trim()) return;
    try {
      await addCommunicationEntry.mutateAsync({
        threadId: selectedCommunicationId,
        content: quickReply.trim(),
      });
      setQuickReply("");
      toast.success("Mensagem enviada.");
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  }

  async function markNotification(notificationId: string) {
    try {
      await markNotificationRead.mutateAsync(notificationId);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  }

  async function markAllNotifications() {
    try {
      await markAllNotificationsRead.mutateAsync();
      toast.success("Notificações marcadas como lidas.");
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  }

  async function openNotification(notification: ClientPortalNotification) {
    const entityType = notification.entity_type;
    const entityId = notification.entity_id;
    const destination = notificationDestination(entityType);
    if (!destination || !entityType || !entityId) return;
    if (!notification.read_at) {
      try {
        await markNotificationRead.mutateAsync(notification.notification_id);
      } catch (error) {
        toast.error(describeError(error, "salvar"));
      }
    }

    focusPortalEntity(entityType, entityId, destination);
  }

  function focusPortalEntity(
    entityType: NonNullable<ClientPortalNotification["entity_type"]>,
    entityId: string,
    destination = notificationDestination(entityType),
  ) {
    if (!destination) return;
    const target = `${entityType}:${entityId}`;
    setActiveTab(destination);
    setHighlightedEntity(target);
    if (entityType === "communication") setSelectedCommunicationId(entityId);
    window.setTimeout(() => {
      document
        .getElementById(portalEntityElementId(entityType, entityId))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    window.setTimeout(
      () => setHighlightedEntity((current) => (current === target ? null : current)),
      3000,
    );
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
    <main className="min-h-dvh bg-gradient-to-b from-primary/5 via-muted/30 to-background">
      <header className="sticky top-0 z-40 border-b border-primary/10 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/meu-portal" className="group flex items-center gap-3 text-primary">
            <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
              <Building2 className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-display font-semibold leading-none">FLUXA</span>
              <span className="mt-1 block text-xs text-muted-foreground">Meu Portal</span>
            </span>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl bg-background/70 shadow-sm"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            {signingOut ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <LogOut className="size-4" aria-hidden />
            )}{" "}
            Sair
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 pt-6 pb-28 sm:px-6 sm:pt-8">
        <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/15 via-background to-background p-6 shadow-xl shadow-primary/5 sm:p-8">
          <div className="absolute -top-20 -right-16 size-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 size-52 rounded-full bg-primary/5 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/70 px-3 py-1.5 text-xs font-medium text-primary shadow-sm backdrop-blur">
                <ShieldCheck className="size-4" aria-hidden /> Área segura e exclusiva
              </div>
              <h1 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Bem-vindo ao seu portal
              </h1>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                Acompanhe seu atendimento e fale com a empresa em um só lugar.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Conta conectada como {user?.email ?? "cliente"}.
              </p>
            </div>
            {activeAccesses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border bg-background/75 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
                  {activeAccesses.length} {activeAccesses.length === 1 ? "acesso ativo" : "acessos ativos"}
                </span>
                {unreadNotifications > 0 && (
                  <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm">
                    {unreadNotifications} {unreadNotifications === 1 ? "novo aviso" : "novos avisos"}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {session.isError ? (
          <PortalError retry={() => void session.refetch()} />
        ) : (session.data?.length ?? 0) === 0 ? (
          <Card className="border-primary/10 bg-background/90 shadow-lg shadow-primary/5">
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
          <Tabs
            value={activeTab}
            className="space-y-6"
            onValueChange={(value) => {
              setActiveTab(value as PortalTab);
              setHighlightedEntity(null);
            }}
          >
            <TabsList className="sticky top-[73px] z-30 grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border border-primary/10 bg-background/90 p-2 shadow-lg shadow-primary/5 backdrop-blur-xl sm:grid-cols-3 lg:grid-cols-6">
              <TabsTrigger value="inicio" className={PORTAL_TAB_CLASS}>
                <Home className="size-4" aria-hidden /> Início
              </TabsTrigger>
              <TabsTrigger value="processos" className={PORTAL_TAB_CLASS}>
                <FolderKanban className="size-4" aria-hidden /> Processos
              </TabsTrigger>
              <TabsTrigger value="documentos" className={PORTAL_TAB_CLASS}>
                <FileText className="size-4" aria-hidden /> Documentos
              </TabsTrigger>
              <TabsTrigger value="pendencias" className={PORTAL_TAB_CLASS}>
                <ListTodo className="size-4" aria-hidden /> Pendências
              </TabsTrigger>
              <TabsTrigger value="comunicacao" className={PORTAL_TAB_CLASS}>
                <MessageSquare className="size-4" aria-hidden /> Comunicação
              </TabsTrigger>
              <TabsTrigger value="notificacoes" className={PORTAL_TAB_CLASS}>
                <Bell className="size-4" aria-hidden /> Notificações
                {unreadNotifications > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                    {unreadNotifications}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inicio" className="space-y-6">
              <AccessCards accesses={session.data ?? []} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
                <SummaryCard
                  icon={Bell}
                  label="Notificações não lidas"
                  value={unreadNotifications}
                  loading={notifications.isLoading}
                />
              </div>

              <section className="flex flex-col gap-4 rounded-2xl border border-primary/10 bg-background/85 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">O que você precisa fazer?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Acesse rapidamente as ações mais importantes do seu atendimento.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("pendencias")}>
                    <Upload className="size-4" aria-hidden /> Enviar documento
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("processos")}>
                    <FolderKanban className="size-4" aria-hidden /> Ver processos
                  </Button>
                  <Button size="sm" onClick={() => setQuickChatOpen(true)}>
                    <MessageSquare className="size-4" aria-hidden /> Falar com a empresa
                  </Button>
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className={PORTAL_PANEL_CLASS}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-warning/10 text-warning">
                        <CalendarDays className="size-4" aria-hidden />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold">Próximos prazos</h2>
                        <p className="text-xs text-muted-foreground">Prioridades do atendimento</p>
                      </div>
                    </div>
                    {portalDeadlines.length === 0 ? (
                      <p className="rounded-xl bg-muted/35 p-4 text-sm text-muted-foreground">
                        Nenhum prazo próximo no momento.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {portalDeadlines.map((deadline) => {
                          const overdue = deadline.dueDate < new Date().toISOString().slice(0, 10);
                          return (
                            <li key={`${deadline.entityType}-${deadline.id}`}>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50"
                                onClick={() =>
                                  focusPortalEntity(deadline.entityType, deadline.id)
                                }
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">
                                    {deadline.title}
                                  </span>
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {deadline.label}
                                  </span>
                                </span>
                                <span
                                  className={
                                    "shrink-0 text-xs font-medium " +
                                    (overdue ? "text-destructive" : "text-muted-foreground")
                                  }
                                >
                                  {overdue ? "Vencido" : formatDate(deadline.dueDate)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card className={PORTAL_PANEL_CLASS}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                        <MessageSquare className="size-4" aria-hidden />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold">Últimas mensagens</h2>
                        <p className="text-xs text-muted-foreground">Conversas com a empresa</p>
                      </div>
                    </div>
                    {(communicationThreads.data?.length ?? 0) === 0 ? (
                      <p className="rounded-xl bg-muted/35 p-4 text-sm text-muted-foreground">
                        Nenhuma conversa iniciada.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {communicationThreads.data?.slice(0, 4).map((thread) => (
                          <li key={thread.thread_id}>
                            <button
                              type="button"
                              className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50"
                              onClick={() =>
                                focusPortalEntity("communication", thread.thread_id)
                              }
                            >
                              <span className="block truncate text-sm font-medium">
                                {thread.subject}
                              </span>
                              <span className="mt-1 block truncate text-xs text-muted-foreground">
                                {thread.last_message ?? "Conversa iniciada"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card className={PORTAL_PANEL_CLASS}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Bell className="size-4" aria-hidden />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold">Atividade recente</h2>
                        <p className="text-xs text-muted-foreground">Novidades do seu portal</p>
                      </div>
                    </div>
                    {(notifications.data?.length ?? 0) === 0 ? (
                      <p className="rounded-xl bg-muted/35 p-4 text-sm text-muted-foreground">
                        Nenhuma atividade recente.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {notifications.data?.slice(0, 4).map((notification) => (
                          <li key={notification.notification_id}>
                            <button
                              type="button"
                              className="flex w-full items-start gap-2 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50"
                              onClick={() => void openNotification(notification)}
                            >
                              {!notification.read_at && (
                                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                              )}
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">
                                  {notification.title}
                                </span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {formatDateTime(notification.created_at)}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="processos">
              <Card className={PORTAL_PANEL_CLASS}>
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
                            id={portalEntityElementId("process", process.process_id)}
                            key={`${process.access_id}-${process.process_id}`}
                            className={
                              "rounded-xl border bg-background p-4 transition-shadow " +
                              (highlightedEntity === `process:${process.process_id}`
                                ? "ring-2 ring-primary ring-offset-2"
                                : "")
                            }
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
              <Card className={PORTAL_PANEL_CLASS}>
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
                            id={portalEntityElementId("document", document.document_id)}
                            key={`${document.access_id}-${document.document_id}`}
                            className={
                              "flex flex-col gap-4 rounded-xl border bg-background p-4 transition-shadow sm:flex-row sm:items-center " +
                              (highlightedEntity === `document:${document.document_id}`
                                ? "ring-2 ring-primary ring-offset-2"
                                : "")
                            }
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
              <Card className={PORTAL_PANEL_CLASS}>
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
                          <li
                            id={portalEntityElementId("document_request", request.request_id)}
                            key={request.request_id}
                            className={
                              "rounded-xl border bg-background p-4 transition-shadow " +
                              (highlightedEntity === `document_request:${request.request_id}`
                                ? "ring-2 ring-primary ring-offset-2"
                                : "")
                            }
                          >
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
              <Card className={PORTAL_PANEL_CLASS}>
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
                <Card className={PORTAL_PANEL_CLASS}>
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
                            <li
                              id={portalEntityElementId("communication", thread.thread_id)}
                              key={thread.thread_id}
                            >
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

                <Card className={PORTAL_PANEL_CLASS}>
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

            <TabsContent value="notificacoes">
              <Card className={PORTAL_PANEL_CLASS}>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">Minhas notificações</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Avisos sobre processos, documentos, pendências e mensagens disponíveis no
                        seu portal.
                      </p>
                    </div>
                    {unreadNotifications > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={markAllNotificationsRead.isPending}
                        onClick={() => void markAllNotifications()}
                      >
                        {markAllNotificationsRead.isPending ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <CheckCheck className="size-4" aria-hidden />
                        )}
                        Marcar todas como lidas
                      </Button>
                    )}
                  </div>

                  {notifications.isLoading ? (
                    <LoadingRows />
                  ) : notifications.isError ? (
                    <ContentError retry={() => void notifications.refetch()} />
                  ) : (notifications.data?.length ?? 0) === 0 ? (
                    <EmptyContent
                      icon={Bell}
                      title="Nenhuma notificação"
                      description="Os novos avisos da empresa aparecerão aqui."
                    />
                  ) : (
                    <ul className="space-y-3">
                      {notifications.data?.map((notification) => (
                        <li key={notification.notification_id}>
                          <article
                            className={
                              "flex items-start gap-3 rounded-lg border p-4 " +
                              (notification.read_at ? "bg-background" : "bg-primary/5")
                            }
                          >
                            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                              <Bell className="size-4" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <h3 className="text-sm font-medium">{notification.title}</h3>
                                {!notification.read_at && (
                                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                                    Nova
                                  </span>
                                )}
                              </div>
                              {notification.body && (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {notification.body}
                                </p>
                              )}
                              <p className="mt-2 text-xs text-muted-foreground">
                                {notification.client_name} · {notification.organization_name} ·{" "}
                                {formatDateTime(notification.created_at)}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-3">
                                {notification.entity_type && notification.entity_id && (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto px-0"
                                    disabled={markNotificationRead.isPending}
                                    onClick={() => void openNotification(notification)}
                                  >
                                    Abrir <ArrowRight className="size-3.5" aria-hidden />
                                  </Button>
                                )}
                                {!notification.read_at && (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto px-0"
                                    disabled={markNotificationRead.isPending}
                                    onClick={() =>
                                      void markNotification(notification.notification_id)
                                    }
                                  >
                                    Marcar como lida
                                  </Button>
                                )}
                              </div>
                            </div>
                          </article>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {activeAccesses.length > 0 && (
          <Popover open={quickChatOpen} onOpenChange={setQuickChatOpen}>
            <PopoverTrigger asChild>
              <Button
                size="lg"
                className="fixed right-4 bottom-5 z-40 size-14 rounded-full shadow-2xl shadow-primary/30 transition-transform hover:scale-105 sm:right-6 sm:w-auto sm:px-5"
                aria-label="Falar com a empresa"
              >
                <MessageSquare className="size-5" aria-hidden />
                <span className="hidden sm:inline">Falar com a empresa</span>
                {unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadMessages}
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
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-white/15">
                    <MessageSquare className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="font-semibold">Fale com a empresa</h2>
                    <p className="text-xs text-primary-foreground/75">
                      Canal protegido do seu portal
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4">
                {communicationThreads.isLoading ? (
                  <LoadingRows />
                ) : quickNewConversation || (communicationThreads.data?.length ?? 0) === 0 ? (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">Nova conversa</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sua mensagem será recebida pela equipe responsável.
                      </p>
                    </div>
                    {activeAccesses.length > 1 && (
                      <Select value={quickAccessId} onValueChange={setQuickAccessId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o atendimento" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccesses.map((access) => (
                            <SelectItem key={access.access_id} value={access.access_id}>
                              {access.client_name} · {access.organization_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      value={quickSubject}
                      maxLength={160}
                      placeholder="Assunto"
                      onChange={(event) => setQuickSubject(event.target.value)}
                    />
                    <Textarea
                      value={quickContent}
                      maxLength={5000}
                      rows={4}
                      placeholder="Como podemos ajudar?"
                      onChange={(event) => setQuickContent(event.target.value)}
                    />
                    <div className="flex items-center justify-between gap-3">
                      {(communicationThreads.data?.length ?? 0) > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setQuickNewConversation(false)}
                        >
                          Voltar
                        </Button>
                      ) : (
                        <span />
                      )}
                      <Button
                        size="sm"
                        disabled={
                          !quickSubject.trim() ||
                          !quickContent.trim() ||
                          createCommunication.isPending
                        }
                        onClick={() => void createQuickConversation()}
                      >
                        {createCommunication.isPending ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Send className="size-4" aria-hidden />
                        )}
                        Enviar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-muted-foreground">Conversa</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setQuickNewConversation(true)}
                      >
                        Nova conversa
                      </Button>
                    </div>
                    <Select
                      value={selectedCommunicationId ?? undefined}
                      onValueChange={setSelectedCommunicationId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma conversa" />
                      </SelectTrigger>
                      <SelectContent>
                        {communicationThreads.data?.map((thread) => (
                          <SelectItem key={thread.thread_id} value={thread.thread_id}>
                            {thread.subject}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl bg-muted/35 p-3">
                      {communicationEntries.isLoading ? (
                        <LoadingRows />
                      ) : (communicationEntries.data?.length ?? 0) === 0 ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          Nenhuma mensagem nesta conversa.
                        </p>
                      ) : (
                        communicationEntries.data?.map((entry) => (
                          <div
                            key={entry.entry_id}
                            className={
                              "max-w-[88%] rounded-xl px-3 py-2 text-xs " +
                              (entry.author_kind === "client"
                                ? "ml-auto bg-primary text-primary-foreground"
                                : "border bg-background")
                            }
                          >
                            <p className="whitespace-pre-wrap">{entry.content}</p>
                            <p
                              className={
                                "mt-1 text-[10px] " +
                                (entry.author_kind === "client"
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground")
                              }
                            >
                              {entry.author_kind === "client" ? "Você" : "Empresa"} ·{" "}
                              {formatDateTime(entry.occurred_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                    {selectedCommunication?.status === "resolvida" ||
                    selectedCommunication?.status === "arquivada" ? (
                      <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                        Esta conversa foi encerrada. Inicie uma nova conversa para continuar.
                      </p>
                    ) : (
                      <div className="flex items-end gap-2">
                        <Textarea
                          value={quickReply}
                          maxLength={5000}
                          rows={2}
                          className="min-h-16 resize-none"
                          placeholder="Digite sua mensagem…"
                          onChange={(event) => setQuickReply(event.target.value)}
                        />
                        <Button
                          size="icon"
                          className="shrink-0"
                          disabled={!quickReply.trim() || addCommunicationEntry.isPending}
                          onClick={() => void sendQuickReply()}
                          aria-label="Enviar mensagem"
                        >
                          {addCommunicationEntry.isPending ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Send className="size-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
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

type PortalTab =
  | "inicio"
  | "processos"
  | "documentos"
  | "pendencias"
  | "comunicacao"
  | "notificacoes";

type PortalDeadline = {
  id: string;
  entityType: "process" | "document_request";
  title: string;
  label: string;
  dueDate: string;
};

const PORTAL_TAB_CLASS =
  "gap-2 rounded-xl py-2.5 text-xs transition-all sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md";
const PORTAL_PANEL_CLASS =
  "overflow-hidden border-primary/10 bg-background/90 shadow-lg shadow-primary/5";

function notificationDestination(
  entityType: ClientPortalNotification["entity_type"],
): PortalTab | null {
  if (entityType === "process") return "processos";
  if (entityType === "document") return "documentos";
  if (entityType === "document_request") return "pendencias";
  if (entityType === "communication") return "comunicacao";
  return null;
}

function portalEntityElementId(
  entityType: NonNullable<ClientPortalNotification["entity_type"]>,
  entityId: string,
) {
  return `portal-${entityType}-${entityId}`;
}

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
        <Card
          key={access.access_id}
          className="group overflow-hidden border-primary/10 bg-background/90 shadow-md shadow-primary/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
        >
          <CardContent className="relative space-y-4 p-6">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary transition-transform duration-300 group-hover:scale-105">
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
    <Card className="group overflow-hidden border-primary/10 bg-background/90 shadow-md shadow-primary/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary transition-transform duration-300 group-hover:scale-110">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{loading ? "—" : value}</p>
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
    <Card className="border-primary/10 bg-background/90 shadow-lg shadow-primary/5">
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
