import { BookOpenCheck, HelpCircle, MessageSquare, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useMyClientPortalFaqArticles,
  useRecordClientPortalFaqEvent,
  type ClientPortalFaqArticle,
} from "@/hooks/use-client-portal-faq";
import type { ClientPortalSessionRow } from "@/hooks/use-client-portal-session";

export function PortalFaq({
  accesses,
  onEscalate,
}: {
  accesses: ClientPortalSessionRow[];
  onEscalate: (access: ClientPortalSessionRow, article: ClientPortalFaqArticle) => void;
}) {
  const [accessId, setAccessId] = useState(accesses[0]?.access_id ?? "");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("todas");
  const viewed = useRef(new Set<string>());
  const query = useMyClientPortalFaqArticles(accessId, Boolean(accessId));
  const record = useRecordClientPortalFaqEvent(accessId);
  const activeAccess = accesses.find((access) => access.access_id === accessId) ?? accesses[0];
  const categories = useMemo(
    () =>
      [...new Set((query.data ?? []).map((article) => article.category))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [query.data],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return (query.data ?? []).filter(
      (article) =>
        (category === "todas" || article.category === category) &&
        (!needle ||
          `${article.title} ${article.answer} ${article.keywords.join(" ")}`
            .toLocaleLowerCase("pt-BR")
            .includes(needle)),
    );
  }, [query.data, search, category]);

  const recordSearch = () => {
    if (search.trim().length >= 2)
      void record
        .mutateAsync({ eventType: "search", searchTerm: search.trim() })
        .catch(() => undefined);
  };
  const opened = (articleId: string) => {
    if (viewed.current.has(articleId)) return;
    viewed.current.add(articleId);
    void record.mutateAsync({ articleId, eventType: "view" }).catch(() => undefined);
  };
  const helpful = async (article: ClientPortalFaqArticle) => {
    try {
      await record.mutateAsync({ articleId: article.id, eventType: "helpful" });
      toast.success("Obrigado. Sua resposta ajuda a melhorar o portal.");
    } catch {
      toast.error("Não foi possível registrar sua avaliação.");
    }
  };
  const escalate = async (article: ClientPortalFaqArticle) => {
    try {
      await record.mutateAsync({ articleId: article.id, eventType: "not_helpful" });
      await record.mutateAsync({ articleId: article.id, eventType: "escalated" });
    } catch {
      // A falha da métrica não impede o cliente de falar com a equipe.
    }
    if (activeAccess) onEscalate(activeAccess, article);
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/10 bg-background/90 shadow-lg shadow-primary/5">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <HelpCircle className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Como podemos ajudar?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pesquise uma dúvida. Se não resolver, sua mensagem já vai preparada para a equipe.
              </p>
            </div>
          </div>
          {accesses.length > 1 && (
            <Select
              value={accessId}
              onValueChange={(value) => {
                setAccessId(value);
                setSearch("");
                setCategory("todas");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accesses.map((access) => (
                  <SelectItem key={access.access_id} value={access.access_id}>
                    {access.client_name} · {access.organization_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                placeholder="Ex.: enviar documento ou acompanhar processo"
                onChange={(event) => setSearch(event.target.value)}
                onBlur={recordSearch}
                onKeyDown={(event) => {
                  if (event.key === "Enter") recordSearch();
                }}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      {query.isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Carregando respostas…
          </CardContent>
        </Card>
      ) : query.isError ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-destructive">
            Não foi possível carregar a ajuda.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma resposta encontrada.</p>
            <Button
              onClick={() =>
                activeAccess &&
                onEscalate(activeAccess, {
                  id: "",
                  title: search || "Dúvida",
                  answer: "",
                  category: "",
                  keywords: [],
                })
              }
            >
              <MessageSquare className="size-4" /> Falar com a equipe
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-primary/10 bg-background/90 shadow-lg shadow-primary/5">
          <CardContent className="p-4 sm:p-6">
            <Accordion type="single" collapsible onValueChange={(value) => value && opened(value)}>
              {filtered.map((article) => (
                <AccordionItem key={article.id} value={article.id}>
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline">{article.category}</Badge>
                      {article.title}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {article.answer}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void helpful(article)}>
                        <BookOpenCheck className="size-4" /> Isso ajudou
                      </Button>
                      <Button size="sm" onClick={() => void escalate(article)}>
                        <MessageSquare className="size-4" /> Ainda preciso de ajuda
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
