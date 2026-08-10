import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Check, Search, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  filterProductUpdates,
  isProductUpdateNew,
  PRODUCT_UPDATE_MODULE_LABELS,
  PRODUCT_UPDATE_TYPE_LABELS,
  type ProductUpdate,
  type ProductUpdateModule,
  type ProductUpdatePeriod,
  type ProductUpdateType,
} from "@/lib/product-updates";

export const Route = createFileRoute("/_authenticated/novidades")({
  head: () => ({
    meta: [
      { title: "Novidades — FLUXA" },
      { name: "description", content: "Novos recursos, melhorias e correções da FLUXA." },
    ],
  }),
  component: ProductUpdatesPage,
});

const typeTone: Record<ProductUpdateType, string> = {
  feature:
    "border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
  improvement:
    "border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  fix: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  security:
    "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

function formatUpdateDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function ProductUpdatesPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ProductUpdateType | "all">("all");
  const [module, setModule] = useState<ProductUpdateModule | "all">("all");
  const [period, setPeriod] = useState<ProductUpdatePeriod>("all");
  const [selected, setSelected] = useState<ProductUpdate | null>(null);
  const updates = useMemo(
    () => filterProductUpdates({ query, type, module, period }),
    [query, type, module, period],
  );
  const featured = updates.filter((update) => update.featured).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-6">
      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-background to-background p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="mb-3">
              <Sparkles className="mr-1 size-3" /> Central de novidades
            </Badge>
            <h1 className="page-title">Novidades</h1>
            <p className="page-subtitle mt-2">
              Acompanhe tudo o que está chegando e evoluindo na FLUXA.
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 px-4 py-3 text-center shadow-sm">
            <strong className="block text-2xl">{updates.length}</strong>
            <span className="text-xs text-muted-foreground">
              {updates.length === 1 ? "novidade" : "novidades"}
            </span>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_190px_190px_170px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar novidades"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nas novidades…"
              className="bg-background pl-9"
            />
          </div>
          <Filter
            label="Filtrar por tipo"
            value={type}
            onChange={(value) => setType(value as ProductUpdateType | "all")}
            items={Object.entries(PRODUCT_UPDATE_TYPE_LABELS)}
            allLabel="Todos os tipos"
          />
          <Filter
            label="Filtrar por módulo"
            value={module}
            onChange={(value) => setModule(value as ProductUpdateModule | "all")}
            items={Object.entries(PRODUCT_UPDATE_MODULE_LABELS)}
            allLabel="Todos os módulos"
          />
          <Filter
            label="Filtrar por período"
            value={period}
            onChange={(value) => setPeriod(value as ProductUpdatePeriod)}
            items={[
              ["7", "Últimos 7 dias"],
              ["30", "Últimos 30 dias"],
              ["90", "Últimos 90 dias"],
            ]}
            allLabel="Todos os períodos"
          />
        </div>
      </header>

      {featured.length > 0 && (
        <section aria-labelledby="featured-title">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h2 id="featured-title" className="text-xl font-semibold">
              Em destaque
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {featured.map((update) => (
              <UpdateCard key={update.id} update={update} onOpen={setSelected} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="timeline-title" aria-live="polite">
        <div className="mb-4">
          <h2 id="timeline-title" className="text-xl font-semibold">
            Histórico de versões
          </h2>
          <p className="text-sm text-muted-foreground">
            Atualizações da mais recente para a mais antiga.
          </p>
        </div>
        {updates.length > 0 ? (
          <div className="relative space-y-4 before:absolute before:bottom-4 before:left-[7px] before:top-4 before:w-px before:bg-border sm:before:left-[107px]">
            {updates.map((update) => (
              <article
                key={update.id}
                className="relative grid gap-3 pl-7 sm:grid-cols-[84px_1fr] sm:pl-0"
              >
                <time
                  dateTime={update.date}
                  className="pt-5 text-xs text-muted-foreground sm:text-right"
                >
                  {formatUpdateDate(update.date)}
                </time>
                <span
                  className="absolute left-1 top-6 size-2 rounded-full bg-primary ring-4 ring-background sm:left-[104px]"
                  aria-hidden
                />
                <Card className="min-w-0 sm:ml-6">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge update={update} />
                      <Badge variant="outline">{PRODUCT_UPDATE_MODULE_LABELS[update.module]}</Badge>
                      {isProductUpdateNew(update) && <Badge>Novo</Badge>}
                      {update.version && (
                        <span className="text-xs text-muted-foreground">v{update.version}</span>
                      )}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold">{update.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{update.summary}</p>
                    <Button
                      variant="link"
                      className="mt-2 h-auto px-0"
                      onClick={() => setSelected(update)}
                    >
                      Ver detalhes <ArrowRight />
                    </Button>
                  </CardContent>
                </Card>
              </article>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="mx-auto mb-3 size-9 text-muted-foreground" />
              <h3 className="font-semibold">Nenhuma novidade encontrada.</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Tente ajustar os filtros ou buscar outro termo.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
      <UpdateDetails update={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  items,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: string[][];
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full bg-background">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {items.map(([key, name]) => (
          <SelectItem key={key} value={key}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TypeBadge({ update }: { update: ProductUpdate }) {
  return (
    <Badge variant="outline" className={typeTone[update.type]}>
      {PRODUCT_UPDATE_TYPE_LABELS[update.type]}
    </Badge>
  );
}

function UpdateCard({
  update,
  onOpen,
}: {
  update: ProductUpdate;
  onOpen: (update: ProductUpdate) => void;
}) {
  return (
    <Card className="flex min-w-0 flex-col border-primary/20 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap gap-2">
          <TypeBadge update={update} />
          <Badge variant="outline">{PRODUCT_UPDATE_MODULE_LABELS[update.module]}</Badge>
          {isProductUpdateNew(update) && <Badge>Novo</Badge>}
        </div>
        <CardTitle className="mt-3 text-lg">{update.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground">{update.summary}</p>
        <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          {formatUpdateDate(update.date)}
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" onClick={() => onOpen(update)}>
          Ver detalhes <ArrowRight />
        </Button>
      </CardFooter>
    </Card>
  );
}

function UpdateDetails({ update, onClose }: { update: ProductUpdate | null; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Sheet open={Boolean(update)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {update && (
          <div className="space-y-6 p-1">
            <SheetHeader>
              <div className="flex flex-wrap gap-2">
                <TypeBadge update={update} />
                <Badge variant="outline">{PRODUCT_UPDATE_MODULE_LABELS[update.module]}</Badge>
                {isProductUpdateNew(update) && <Badge>Novo</Badge>}
              </div>
              <SheetTitle className="text-2xl">{update.title}</SheetTitle>
              <SheetDescription>
                {formatUpdateDate(update.date)}
                {update.version ? ` · Versão ${update.version}` : ""}
              </SheetDescription>
            </SheetHeader>
            <p className="leading-relaxed text-muted-foreground">{update.description}</p>
            <div>
              <h3 className="font-semibold">O que mudou</h3>
              <ul className="mt-3 space-y-3">
                {update.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
            {update.relatedRoute && (
              <Button
                onClick={() => {
                  onClose();
                  void navigate({ to: update.relatedRoute as "/central" });
                }}
              >
                Ir para o módulo <ArrowRight />
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
