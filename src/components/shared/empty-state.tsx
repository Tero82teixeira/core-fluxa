import type { ReactNode } from "react";
import { Construction } from "lucide-react";

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
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-border bg-muted/60">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Estado explícito de funcionalidade futura — nunca simula recursos inexistentes. */
export function ComingSoon({
  title,
  summary,
  bullets,
}: {
  title: string;
  summary: string;
  bullets: string[];
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand uppercase">
          <Construction className="size-4" aria-hidden />
          Funcionalidade futura
        </div>
        <h2 className="mt-3 text-xl font-semibold sm:text-2xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{summary}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {bullets.map((item) => (
            <li key={item} className="flex gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted-foreground">
          Este módulo ainda não está disponível. Nenhuma ação desta tela executa operações reais.
        </p>
      </CardContent>
    </Card>
  );
}
