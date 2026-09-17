import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({
  label = "Carregando dados",
  rows = 4,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <Card
      className={className}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <CardContent className="space-y-3 p-6">
        <span className="sr-only">{label}…</span>
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export function ErrorState({
  title = "Não foi possível carregar os dados",
  description = "Verifique sua conexão e tente novamente.",
  onRetry,
  retrying = false,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("border-destructive/30", className)} role="alert">
      <CardContent className="flex flex-col items-center p-8 text-center">
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-5 text-destructive" aria-hidden />
        </span>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
        {onRetry && (
          <Button className="mt-5" variant="outline" disabled={retrying} onClick={onRetry}>
            {retrying ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-2 size-4" aria-hidden />
            )}
            {retrying ? "Tentando novamente…" : "Tentar novamente"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
