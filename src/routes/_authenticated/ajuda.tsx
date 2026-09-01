import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, ChevronRight, LifeBuoy, Search } from "lucide-react";
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
import { goToHelpArticleModule, openHelpArticle } from "@/lib/help-center-interactions";
import {
  useCreateSupportRequest,
  useReplySupportRequest,
  useSupportRequestThread,
  useSupportRequests,
  useUpdateSupportStatus,
  type SupportPriority,
  type SupportRequest,
  type SupportStatus,
} from "@/hooks/use-support-requests";
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
  const articleTitleRef = useRef<HTMLHeadingElement>(null);
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
                type="button"
                key={a.id}
                onClick={(event) => openHelpArticle(event, a, setSelected)}
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
                type="button"
                key={a.id}
                onClick={(event) => openHelpArticle(event, a, setSelected)}
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
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            articleTitleRef.current?.focus();
          }}
        >
          {selected && (
            <>
              <DialogHeader>
                <Badge className="w-fit" variant="secondary">
                  {selected.category}
                </Badge>
                <DialogTitle ref={articleTitleRef} tabIndex={-1}>
                  {selected.title}
                </DialogTitle>
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
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  onClick={(event) =>
                    goToHelpArticleModule(event, selected, setSelected, (relatedRoute) => {
                      void navigate({ to: relatedRoute as "/central" });
                    })
                  }
                >
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
        <Button
          type="button"
          className="mt-3 px-0"
          variant="link"
          onClick={(event) => openHelpArticle(event, article, onOpen)}
        >
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
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<SupportRequest | null>(null);
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
      ) : visible.length ? (
        <div className="space-y-2">
          {visible.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row">
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
                <div className="flex flex-wrap items-center gap-2">
                  {admin ? (
                    <select
                      aria-label={`Status de ${r.subject}`}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={r.status}
                      disabled={r.status === "arquivado" || update.isPending}
                      onChange={(e) =>
                        void update.mutateAsync({
                          id: r.id,
                          status: e.target.value as SupportStatus,
                        })
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
                  <Button variant="outline" size="sm" onClick={() => setSelectedRequest(r)}>
                    Ver atendimento
                  </Button>
                </div>
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
      <CustomerSupportDialog
        request={selectedRequest}
        organizationId={organizationId}
        onClose={() => setSelectedRequest(null)}
      />
    </section>
  );
}

function CustomerSupportDialog({
  request,
  organizationId,
  onClose,
}: {
  request: SupportRequest | null;
  organizationId: string | null;
  onClose: () => void;
}) {
  const thread = useSupportRequestThread(request?.id ?? null);
  const reply = useReplySupportRequest(organizationId, request?.id ?? null);
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (message.trim().length < 2) {
      toast.error("Escreva sua resposta antes de enviar.");
      return;
    }
    try {
      await reply.mutateAsync({ message });
      setMessage("");
      toast.success("Resposta enviada ao suporte FLUXA.");
    } catch {
      toast.error("Não foi possível enviar sua resposta.");
    }
  };

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>{request.subject}</DialogTitle>
              <DialogDescription>
                {request.category} · {statusLabel[request.status]}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Solicitação original
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{request.description}</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Conversa com o suporte</h3>
                {thread.isLoading && (
                  <p className="text-sm text-muted-foreground">Carregando respostas…</p>
                )}
                {!thread.isLoading && (thread.data ?? []).length === 0 && (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    O suporte ainda não enviou uma resposta.
                  </p>
                )}
                {(thread.data ?? []).map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-lg border p-3 ${
                      entry.author_kind === "platform" ? "border-blue-200 bg-blue-50/70" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <strong>{entry.author_name}</strong>
                      <span className="text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.message}</p>
                  </div>
                ))}
              </div>
              {request.status !== "arquivado" && (
                <div className="space-y-2 rounded-lg border p-4">
                  <h3 className="font-semibold">Responder</h3>
                  <Textarea
                    rows={4}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Escreva uma resposta ou envie mais informações…"
                  />
                  <Button disabled={reply.isPending} onClick={() => void submit()}>
                    {reply.isPending ? "Enviando…" : "Enviar resposta"}
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
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
