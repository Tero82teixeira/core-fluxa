import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, ChevronRight, History, LifeBuoy, MessageSquare, Search } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";
import {
  FAQ_IDS,
  HELP_ARTICLES,
  HELP_CATEGORIES,
  QUICK_GUIDE_IDS,
  searchHelpArticles,
  type HelpArticle,
  type HelpCategory,
} from "@/lib/help-center";
import {
  useCreateSupportRequest,
  useAddSupportRequestComment,
  useArchiveSupportRequest,
  useAssignSupportRequest,
  useSupportRequestComments,
  useSupportRequestTimeline,
  useSupportRequests,
  useUpdateSupportStatus,
  type SupportPriority,
  type SupportRequest,
  type SupportStatus,
} from "@/hooks/use-support-requests";
import { useTeamMembers } from "@/hooks/use-team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/ajuda")({
  head: () => ({
    meta: [
      { title: "Ajuda e Suporte — FLUXA" },
      { name: "description", content: "Central de ajuda e solicitações internas da FLUXA." },
    ],
  }),
  component: HelpPage,
});
const adminRoles = new Set(["superadmin", "proprietario", "administrador", "gestor"]);
const statusLabel: Record<SupportStatus, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  aguardando_usuario: "Aguardando usuário",
  resolvido: "Resolvido",
  arquivado: "Arquivado",
};
function HelpPage() {
  const { organizationId, role, user } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | null>(null);
  const [selected, setSelected] = useState<HelpArticle | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const results = useMemo(() => searchHelpArticles(query, category), [query, category]);
  const faq = FAQ_IDS.map((id) => HELP_ARTICLES.find((a) => a.id === id)!).filter(Boolean);
  const guides = QUICK_GUIDE_IDS.map((id) => HELP_ARTICLES.find((a) => a.id === id)!).filter(
    Boolean,
  );
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-6">
      <header className="rounded-2xl bg-gradient-to-br from-primary/15 via-background to-background p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge className="mb-3" variant="secondary">
              <LifeBuoy className="mr-1 size-3" />
              Central de conhecimento
            </Badge>
            <h1 className="page-title">Ajuda e Suporte</h1>
            <p className="page-subtitle mt-2 max-w-2xl">
              Encontre respostas para usar a FLUXA e acompanhe solicitações internas com segurança.
            </p>
          </div>
          <Button onClick={() => setSupportOpen(true)}>
            <LifeBuoy />
            Solicitar suporte
          </Button>
        </div>
        <div className="relative mt-6 max-w-3xl">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Como podemos ajudar?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Como podemos ajudar?"
            className="h-12 bg-background pl-12 text-base"
          />
        </div>
      </header>
      <section aria-labelledby="categories">
        <h2 id="categories" className="mb-3 text-xl font-semibold">
          Categorias
        </h2>
        <div className="flex flex-wrap gap-2">
          {HELP_CATEGORIES.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={category === c ? "default" : "outline"}
              onClick={() => setCategory(category === c ? null : c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </section>
      <section aria-live="polite">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold">Artigos</h2>
            <p className="text-sm text-muted-foreground">
              {results.length} conteúdo(s) encontrado(s)
            </p>
          </div>
          {(query || category) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setCategory(null);
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
        {results.length ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {results.map((a) => (
              <ArticleCard key={a.id} article={a} onOpen={setSelected} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <BookOpen className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">Nenhum conteúdo encontrado.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tente outro termo ou abra uma solicitação de suporte.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => setSupportOpen(true)}>
                Solicitar suporte
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-xl font-semibold">Guias rápidos</h2>
          <div className="space-y-2">
            {guides.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className="flex w-full items-center justify-between rounded-lg border bg-card p-3 text-left hover:bg-accent"
              >
                <span>
                  <strong className="block text-sm">{a.title}</strong>
                  <span className="text-xs text-muted-foreground">{a.summary}</span>
                </span>
                <ChevronRight className="size-4 shrink-0" />
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-semibold">Perguntas frequentes</h2>
          <div className="space-y-2">
            {faq.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className="w-full rounded-lg border bg-card p-3 text-left text-sm font-medium hover:bg-accent"
              >
                {a.question}
              </button>
            ))}
          </div>
        </section>
      </div>
      <SupportArea
        organizationId={organizationId}
        userId={user?.id ?? null}
        admin={Boolean(role && adminRoles.has(role))}
        openForm={() => setSupportOpen(true)}
      />
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <Badge className="w-fit" variant="secondary">
                  {selected.category}
                </Badge>
                <DialogTitle>{selected.title}</DialogTitle>
                <DialogDescription>{selected.summary}</DialogDescription>
              </DialogHeader>
              <div>
                <h3 className="font-semibold">Passo a passo</h3>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
                  {selected.content.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
                <h3 className="mt-5 font-semibold">Dicas</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {selected.tips.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Fechar
                </Button>
                <Button onClick={() => void navigate({ to: selected.relatedRoute as "/central" })}>
                  Ir para o módulo
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <SupportForm
        open={supportOpen}
        onOpenChange={setSupportOpen}
        organizationId={organizationId}
      />
    </div>
  );
}
function ArticleCard({
  article,
  onOpen,
}: {
  article: HelpArticle;
  onOpen: (a: HelpArticle) => void;
}) {
  return (
    <Card className="transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader>
        <Badge variant="outline" className="w-fit">
          {article.category}
        </Badge>
        <CardTitle className="text-base">{article.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-2 text-sm text-muted-foreground">{article.summary}</p>
        <Button className="mt-3 px-0" variant="link" onClick={() => onOpen(article)}>
          Ler artigo <ChevronRight />
        </Button>
      </CardContent>
    </Card>
  );
}
function SupportForm({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string | null;
}) {
  const create = useCreateSupportRequest(organizationId);
  const [form, setForm] = useState({
    subject: "",
    category: "",
    description: "",
    priority: "normal" as SupportPriority,
    relatedModule: "",
    relatedRoute: "",
  });
  const submit = async () => {
    if (form.subject.trim().length < 3 || form.description.trim().length < 10 || !form.category) {
      toast.error("Preencha assunto, categoria e uma descrição detalhada.");
      return;
    }
    try {
      await create.mutateAsync(form);
      toast.success("Solicitação criada.");
      onOpenChange(false);
      setForm({
        subject: "",
        category: "",
        description: "",
        priority: "normal",
        relatedModule: "",
        relatedRoute: "",
      });
    } catch {
      toast.error("Não foi possível criar a solicitação.");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar suporte</DialogTitle>
          <DialogDescription>
            Descreva o que precisa. Não inclua senhas ou dados sensíveis.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Assunto">
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </Field>
          <Field label="Categoria">
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">Selecione</option>
              {HELP_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Descrição">
            <Textarea
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prioridade">
              <select
                className="h-9 rounded-md border bg-background px-3"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as SupportPriority })}
              >
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </select>
            </Field>
            <Field label="Módulo relacionado">
              <Input
                value={form.relatedModule}
                onChange={(e) => setForm({ ...form, relatedModule: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Página/rota atual (opcional)">
            <Input
              placeholder="/tarefas"
              value={form.relatedRoute}
              onChange={(e) => setForm({ ...form, relatedRoute: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={create.isPending} onClick={() => void submit()}>
            {create.isPending ? "Enviando…" : "Criar solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function SupportArea({
  organizationId,
  userId,
  admin,
  openForm,
}: {
  organizationId: string | null;
  userId: string | null;
  admin: boolean;
  openForm: () => void;
}) {
  const requests = useSupportRequests(organizationId);
  const update = useUpdateSupportStatus(organizationId);
  const [selectedRequest, setSelectedRequest] = useState<SupportRequest | null>(null);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const visible = (requests.data ?? []).filter(
    (r) =>
      (admin || r.created_by === userId) &&
      (!status || r.status === status) &&
      (!priority || r.priority === priority) &&
      (!category || r.category === category),
  );
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">
            {admin ? "Solicitações da organização" : "Minhas solicitações"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe pedidos de ajuda sem sair da FLUXA.
          </p>
        </div>
        <Button variant="outline" onClick={openForm}>
          Nova solicitação
        </Button>
      </div>
      {admin && (
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Filter
            value={status}
            onChange={setStatus}
            label="Status"
            options={Object.entries(statusLabel)}
          />
          <Filter
            value={category}
            onChange={setCategory}
            label="Categoria"
            options={HELP_CATEGORIES.map((x) => [x, x])}
          />
          <Filter
            value={priority}
            onChange={setPriority}
            label="Prioridade"
            options={[
              ["baixa", "Baixa"],
              ["normal", "Normal"],
              ["alta", "Alta"],
            ]}
          />
        </div>
      )}
      {requests.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando solicitações…</p>
      ) : requests.isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            Não foi possível carregar as solicitações.
          </CardContent>
        </Card>
      ) : visible.length ? (
        <div className="space-y-2">
          {visible.map((r) => (
            <Card key={r.id} className="transition hover:border-primary/50 hover:shadow-sm">
              <CardContent
                className="flex flex-col justify-between gap-3 p-4 sm:flex-row"
                onClick={() => setSelectedRequest(r)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setSelectedRequest(r)}
              >
                <div>
                  <div className="flex flex-wrap gap-2">
                    <strong>{r.subject}</strong>
                    <Badge variant="outline">{r.category}</Badge>
                    <Badge>{r.priority}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Criado em {new Date(r.created_at).toLocaleDateString("pt-BR")} · atualizado em{" "}
                    {new Date(r.updated_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                {admin ? (
                  <select
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Status de ${r.subject}`}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={r.status}
                    disabled={r.status === "arquivado" || update.isPending}
                    onChange={(e) =>
                      void update.mutateAsync({ id: r.id, status: e.target.value as SupportStatus })
                    }
                  >
                    {Object.entries(statusLabel)
                      .filter(([v]) => v !== "arquivado")
                      .map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                  </select>
                ) : (
                  <Badge className="w-fit" variant="secondary">
                    {statusLabel[r.status]}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Você ainda não abriu nenhuma solicitação.
          </CardContent>
        </Card>
      )}
      <SupportRequestDetail
        request={
          selectedRequest
            ? (requests.data?.find((item) => item.id === selectedRequest.id) ?? selectedRequest)
            : null
        }
        organizationId={organizationId}
        admin={admin}
        onClose={() => setSelectedRequest(null)}
      />
    </section>
  );
}

const eventLabel: Record<string, string> = {
  created: "Chamado criado",
  status_changed: "Status alterado",
  assigned: "Responsável atribuído",
  unassigned: "Responsável removido",
  comment_added: "Comentário adicionado",
  resolved: "Chamado resolvido",
  reopened: "Chamado reaberto",
  archived: "Chamado arquivado",
};
const formatDateTime = (value: string) => new Date(value).toLocaleString("pt-BR");

function SupportRequestDetail({
  request,
  organizationId,
  admin,
  onClose,
}: {
  request: SupportRequest | null;
  organizationId: string | null;
  admin: boolean;
  onClose: () => void;
}) {
  const timeline = useSupportRequestTimeline(request?.id ?? null);
  const comments = useSupportRequestComments(request?.id ?? null);
  const addComment = useAddSupportRequestComment(organizationId, request?.id ?? null);
  const update = useUpdateSupportStatus(organizationId);
  const assign = useAssignSupportRequest(organizationId);
  const archive = useArchiveSupportRequest(organizationId);
  const team = useTeamMembers(organizationId);
  const [body, setBody] = useState("");
  const names = new Map(
    (team.data ?? []).map((member) => [
      member.user_id,
      member.full_name || member.email || "Usuário",
    ]),
  );
  if (!request)
    return (
      <Dialog open={false}>
        <DialogContent />
      </Dialog>
    );
  const submitComment = async () => {
    if (!body.trim()) return;
    try {
      await addComment.mutateAsync(body.trim());
      setBody("");
      toast.success("Comentário adicionado.");
    } catch {
      toast.error("Não foi possível adicionar o comentário.");
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94vh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{statusLabel[request.status]}</Badge>
            <Badge variant="outline">Prioridade {request.priority}</Badge>
          </div>
          <DialogTitle className="text-left text-xl">{request.subject}</DialogTitle>
          <DialogDescription className="text-left">
            Detalhes e acompanhamento do chamado.
          </DialogDescription>
        </DialogHeader>
        {admin && request.status !== "arquivado" && (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
            <select
              aria-label="Alterar status"
              className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
              value={request.status}
              disabled={update.isPending}
              onChange={async (e) => {
                try {
                  await update.mutateAsync({
                    id: request.id,
                    status: e.target.value as SupportStatus,
                  });
                  toast.success("Status atualizado.");
                } catch {
                  toast.error("Não foi possível alterar o status.");
                }
              }}
            >
              {Object.entries(statusLabel)
                .filter(([value]) => value !== "arquivado")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
            <select
              aria-label="Atribuir responsável"
              className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
              value={request.assigned_to ?? ""}
              disabled={assign.isPending || team.isLoading}
              onChange={async (e) => {
                try {
                  await assign.mutateAsync({ id: request.id, assignedTo: e.target.value || null });
                  toast.success("Responsável atualizado.");
                } catch {
                  toast.error("Não foi possível atribuir o responsável.");
                }
              }}
            >
              <option value="">Sem responsável</option>
              {(team.data ?? [])
                .filter((m) => m.is_active)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {names.get(m.user_id)}
                  </option>
                ))}
            </select>
            <Button
              variant="outline"
              disabled={archive.isPending}
              onClick={async () => {
                try {
                  await archive.mutateAsync(request.id);
                  toast.success("Chamado arquivado.");
                  onClose();
                } catch {
                  toast.error("Não foi possível arquivar.");
                }
              }}
            >
              Arquivar
            </Button>
          </div>
        )}
        <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Summary label="Categoria" value={request.category} />
          <Summary label="Criado por" value={names.get(request.created_by) ?? "Usuário"} />
          <Summary
            label="Responsável"
            value={
              request.assigned_to
                ? (names.get(request.assigned_to) ?? "Usuário")
                : "Sem responsável"
            }
          />
          <Summary label="Criação" value={formatDateTime(request.created_at)} />
          <Summary label="Atualização" value={formatDateTime(request.updated_at)} />
          <Summary
            label="Resolução"
            value={request.resolved_at ? formatDateTime(request.resolved_at) : "Não resolvido"}
          />
          {request.related_module && (
            <Summary label="Módulo relacionado" value={request.related_module} />
          )}
        </dl>
        <section>
          <h3 className="font-semibold">Descrição</h3>
          <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 text-sm">
            {request.description}
          </p>
        </section>
        <section>
          <h3 className="mb-3 flex items-center font-semibold">
            <MessageSquare className="mr-2 size-4" />
            Comentários
          </h3>
          {comments.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando comentários…</p>
          ) : comments.isError ? (
            <p className="text-sm text-destructive">Não foi possível carregar os comentários.</p>
          ) : comments.data?.length ? (
            <div className="space-y-2">
              {comments.data.map((comment) => (
                <article key={comment.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                    <strong className="text-foreground">
                      {names.get(comment.author_user_id) ?? "Usuário"}
                    </strong>
                    <time>{formatDateTime(comment.created_at)}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Ainda não há comentários.</p>
          )}
          {request.status !== "arquivado" && (
            <div className="mt-3 space-y-2">
              <Textarea
                aria-label="Novo comentário"
                placeholder="Escreva um comentário…"
                value={body}
                maxLength={5000}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  disabled={!body.trim() || addComment.isPending}
                  onClick={() => void submitComment()}
                >
                  {addComment.isPending ? "Enviando…" : "Adicionar comentário"}
                </Button>
              </div>
            </div>
          )}
        </section>
        <section>
          <h3 className="mb-3 flex items-center font-semibold">
            <History className="mr-2 size-4" />
            Timeline
          </h3>
          {timeline.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando histórico…</p>
          ) : timeline.isError ? (
            <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>
          ) : timeline.data?.length ? (
            <ol className="space-y-3 border-l pl-4">
              {timeline.data.map((event) => (
                <li
                  key={event.id}
                  className="relative text-sm before:absolute before:-left-[21px] before:top-1.5 before:size-2 before:rounded-full before:bg-primary"
                >
                  <div className="font-medium">
                    {eventLabel[event.event_type] ?? event.event_type}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {names.get(event.actor_user_id ?? "") ?? "Sistema"} ·{" "}
                    {formatDateTime(event.created_at)}
                  </div>
                  {event.message && (
                    <p className="mt-1 break-words text-muted-foreground">{event.message}</p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}
function Filter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: ReadonlyArray<readonly string[]>;
}) {
  return (
    <select
      aria-label={label}
      className="h-9 rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label}: todos</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
