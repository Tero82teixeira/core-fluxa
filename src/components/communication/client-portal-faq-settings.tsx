import { BookOpenText, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useClientPortalFaqArticles,
  useSaveClientPortalFaqArticle,
  type ClientPortalFaqArticle,
} from "@/hooks/use-client-portal-faq";
import { describeError } from "@/lib/errors";

const blank = {
  id: null as string | null,
  title: "",
  answer: "",
  category: "Geral",
  keywords: "",
  sortOrder: 0,
  isPublished: true,
};

export function ClientPortalFaqSettings({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const query = useClientPortalFaqArticles(organizationId, canManage);
  const save = useSaveClientPortalFaqArticle(organizationId);
  const [form, setForm] = useState(blank);
  if (!canManage) return null;

  const edit = (article: ClientPortalFaqArticle) =>
    setForm({
      id: article.id,
      title: article.title,
      answer: article.answer,
      category: article.category,
      keywords: article.keywords.join(", "),
      sortOrder: article.sort_order ?? 0,
      isPublished: article.is_published ?? true,
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.title.trim().length < 3)
      return toast.error("Informe uma pergunta com pelo menos 3 caracteres.");
    if (form.answer.trim().length < 3)
      return toast.error("Informe uma resposta com pelo menos 3 caracteres.");
    try {
      await save.mutateAsync({
        id: form.id,
        title: form.title,
        answer: form.answer,
        category: form.category,
        keywords: form.keywords
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 20),
        sortOrder: form.sortOrder,
        isPublished: form.isPublished,
      });
      toast.success(form.id ? "Artigo atualizado." : "Artigo criado.");
      setForm(blank);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenText className="size-4 text-primary" aria-hidden />
              FAQ e autoatendimento do portal
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Publique respostas para o cliente encontrar ajuda antes de abrir uma conversa.
            </p>
          </div>
          {form.id && (
            <Button variant="outline" size="sm" onClick={() => setForm(blank)}>
              <X className="size-4" aria-hidden /> Cancelar edição
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <form
          className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2"
          onSubmit={submit}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="faq-title">Pergunta</Label>
            <Input
              id="faq-title"
              maxLength={160}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Ex.: Como acompanho meu processo?"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="faq-answer">Resposta</Label>
            <Textarea
              id="faq-answer"
              rows={4}
              maxLength={5000}
              value={form.answer}
              onChange={(event) => setForm({ ...form, answer: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-category">Categoria</Label>
            <Input
              id="faq-category"
              maxLength={60}
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-keywords">Palavras-chave</Label>
            <Input
              id="faq-keywords"
              value={form.keywords}
              onChange={(event) => setForm({ ...form, keywords: event.target.value })}
              placeholder="prazo, documento, andamento"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-order">Ordem</Label>
            <Input
              id="faq-order"
              type="number"
              min={0}
              max={9999}
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
            />
          </div>
          <div className="flex items-center gap-2 self-end">
            <Switch
              id="faq-published"
              checked={form.isPublished}
              onCheckedChange={(isPublished) => setForm({ ...form, isPublished })}
            />
            <Label htmlFor="faq-published">Publicado no portal</Label>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button disabled={save.isPending}>
              {form.id ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {form.id ? "Salvar alterações" : "Criar artigo"}
            </Button>
          </div>
        </form>
        {query.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando artigos…</p>
        ) : query.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            Não foi possível carregar o FAQ.
          </p>
        ) : (query.data?.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum artigo cadastrado.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {query.data?.map((article) => (
              <li key={article.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{article.title}</strong>
                      <Badge variant="outline">{article.category}</Badge>
                      <Badge variant={article.is_published ? "secondary" : "outline"}>
                        {article.is_published ? "Publicado" : "Rascunho"}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {article.answer}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${article.title}`}
                    onClick={() => edit(article)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
