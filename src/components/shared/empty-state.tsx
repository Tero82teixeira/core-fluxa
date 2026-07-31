import type { ReactNode } from "react";
import { CircleDashed, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { IconType } from "@/lib/domain";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: IconType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {Icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-border bg-muted/60">
          <Icon className="size-6 text-muted-foreground" aria-hidden />
        </div>
      )}
      <h3 className="section-title">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export type ComingSoonVariant = "list" | "grid" | "timeline" | "split";

/** Estado explícito de funcionalidade futura — nunca simula recursos inexistentes. */
export function ComingSoon({
  title,
  benefit,
  summary,
  bullets,
  icon: Icon = Sparkles,
  variant = "grid",
}: {
  title: string;
  /** Benefício principal do módulo, em uma frase curta. */
  benefit?: string;
  summary: string;
  bullets: string[];
  icon?: IconType;
  variant?: ComingSoonVariant;
}) {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-dashed">
        <CardContent className="p-6 sm:p-8">
          <div
            className={cn(
              "gap-6",
              variant === "split" ? "grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center" : "block",
            )}
          >
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">
                <span className="grid size-9 place-items-center rounded-xl border border-brand/30 bg-brand/10">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                Módulo em preparação
              </div>
              <h2 className="page-title mt-4">{title}</h2>
              {benefit && <p className="mt-2 max-w-2xl text-base font-medium text-foreground">{benefit}</p>}
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{summary}</p>
            </div>

            <div className={cn(variant === "split" ? "" : "mt-6")}>
              <p className="field-label">Recursos planejados</p>
              {variant === "timeline" ? (
                <ol className="mt-3 space-y-3 border-l border-border pl-5">
                  {bullets.map((item, index) => (
                    <li key={item} className="relative text-sm">
                      <span
                        className="absolute -left-[1.6rem] top-1 grid size-4 place-items-center rounded-full border border-border bg-card text-[0.6rem] text-muted-foreground"
                        aria-hidden
                      >
                        {index + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ol>
              ) : variant === "list" ? (
                <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                  {bullets.map((item) => (
                    <li key={item} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className={cn("mt-3 grid gap-3", variant === "split" ? "" : "sm:grid-cols-2")}>
                  {bullets.map((item) => (
                    <li key={item} className="flex gap-3 rounded-lg border border-border bg-muted/40 p-3.5 text-sm">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Este módulo será ativado nas próximas etapas da FLUXA. Nenhuma ação desta tela executa operações reais.
      </p>
    </div>
  );
}
