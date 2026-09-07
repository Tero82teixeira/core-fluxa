import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Sparkles, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCommunicationCopilot } from "@/hooks/use-communication-copilot";
import { COPILOT_PRIVACY_LABELS, describeCopilotError } from "@/lib/communication-copilot";

export function CommunicationCopilot({
  threadId,
  draft,
  onUseSuggestion,
  currentPriority,
  onApplyPriority,
}: {
  threadId: string;
  draft: string;
  onUseSuggestion: (value: string) => void;
  currentPriority: "baixa" | "normal" | "alta" | "urgente";
  onApplyPriority: (value: "baixa" | "normal" | "alta" | "urgente") => Promise<void>;
}) {
  const copilot = useCommunicationCopilot();
  const response = copilot.data;
  const result = response?.result;

  useEffect(() => {
    copilot.reset();
  }, [threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (mode: "assist" | "review") => {
    try {
      await copilot.mutateAsync({ threadId, mode, draft });
    } catch (error) {
      toast.error(describeCopilotError(error));
    }
  };

  const privacyVariant =
    result?.privacy.level === "high"
      ? "destructive"
      : result?.privacy.level === "attention"
        ? "secondary"
        : "outline";

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-2">
          <span className="rounded-md bg-primary/10 p-2 text-primary">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">Copiloto de Comunicação</p>
            <p className="text-xs text-muted-foreground">
              Resume, sugere e revisa. A IA nunca envia mensagens sozinha.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={copilot.isPending}
            onClick={() => run("assist")}
          >
            <Sparkles className="mr-1.5 size-4" />
            {copilot.isPending ? "Analisando…" : "Analisar conversa"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={copilot.isPending || !draft.trim()}
            onClick={() => run("review")}
          >
            <WandSparkles className="mr-1.5 size-4" />
            Revisar rascunho
          </Button>
        </div>
      </div>

      {result && (
        <div className="grid gap-3 border-t pt-3 text-sm lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="field-label mb-1">Resumo</p>
              <p className="whitespace-pre-wrap leading-relaxed">{result.summary}</p>
            </div>
            {result.next_steps.length > 0 && (
              <div>
                <p className="field-label mb-1">Próximos passos sugeridos</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {result.next_steps.map((step, index) => (
                    <li key={`${index}-${step}`}>{step}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="field-label">Triagem inteligente</p>
                <Badge
                  variant={
                    result.triage.suggested_priority === "urgente" ? "destructive" : "secondary"
                  }
                >
                  Prioridade {result.triage.suggested_priority}
                </Badge>
              </div>
              <p className="mt-2 text-sm">{result.triage.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Próxima ação: {result.triage.recommended_action}
              </p>
              {currentPriority !== result.triage.suggested_priority && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => onApplyPriority(result.triage.suggested_priority)}
                >
                  Aplicar prioridade {result.triage.suggested_priority}
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-3 rounded-md border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="field-label">Resposta sugerida</p>
              <Badge variant={privacyVariant}>
                {result.privacy.level === "safe" ? (
                  <CheckCircle2 className="mr-1 size-3" />
                ) : (
                  <AlertTriangle className="mr-1 size-3" />
                )}
                {COPILOT_PRIVACY_LABELS[result.privacy.level]}
              </Badge>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{result.suggested_reply}</p>
            {result.privacy.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-300">
                {result.privacy.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              size="sm"
              disabled={!result.suggested_reply.trim()}
              onClick={() => onUseSuggestion(result.suggested_reply)}
            >
              Usar como rascunho
            </Button>
          </div>
          <p className="text-xs text-muted-foreground lg:col-span-2">
            Revise fatos, tom e dados pessoais antes de enviar. Modelo: {response.model}.
          </p>
        </div>
      )}
    </div>
  );
}
