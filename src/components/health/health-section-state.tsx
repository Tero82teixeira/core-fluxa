import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Errors stay in their section and never masquerade as empty/zero results. */
export function HealthSectionState({
  label,
  loading,
  error,
  onRetry,
  children,
}: {
  label: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div
        role="status"
        aria-busy="true"
        className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando {label}…
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
      >
        <p className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          Não foi possível carregar {label}.
        </p>
        <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    );
  return children;
}
