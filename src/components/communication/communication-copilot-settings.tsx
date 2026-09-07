import { BrainCircuit, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  useCommunicationCopilotSettings,
  useUpdateCommunicationCopilotSettings,
} from "@/hooks/use-communication-copilot";
import { describeError } from "@/lib/errors";

export function CommunicationCopilotSettings({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const settings = useCommunicationCopilotSettings(organizationId);
  const update = useUpdateCommunicationCopilotSettings(organizationId);

  const change = async (enabled: boolean) => {
    try {
      await update.mutateAsync(enabled);
      toast.success(enabled ? "Copiloto de Comunicação ativado." : "Copiloto desativado.");
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <div className="mt-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl gap-3">
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <BrainCircuit className="size-5" aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold">Copiloto de Comunicação com IA</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Resume conversas públicas, sugere respostas e revisa o texto antes do envio. Notas
              internas, campos cadastrais de clientes, nomes da equipe e dados financeiros não são
              incluídos automaticamente no contexto enviado à IA.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
          <div className="text-right">
            <span className="block text-sm font-medium">
              {settings.data ? "Ativado" : "Desativado"}
            </span>
            {!settings.isLoading && !update.isPending && (
              <span className="flex items-center justify-end gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" aria-hidden />
                Salvo automaticamente
              </span>
            )}
            {update.isPending && (
              <span className="block text-[11px] text-muted-foreground">Salvando…</span>
            )}
          </div>
          <Switch
            aria-label="Ativar Copiloto de Comunicação"
            checked={settings.data ?? false}
            disabled={!canManage || settings.isLoading || update.isPending}
            onCheckedChange={change}
          />
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        <p>
          Ativação opcional e auditada. O conteúdo público da conversa e o rascunho poderão ser
          processados pelo provedor de IA configurado. A decisão e o envio continuam sempre com uma
          pessoa da equipe.
        </p>
      </div>
    </div>
  );
}
