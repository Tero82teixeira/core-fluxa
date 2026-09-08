import { BellRing, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushNotificationSettings({ organizationId }: { organizationId: string | null }) {
  const push = usePushNotifications(organizationId);
  const enable = async () => {
    try {
      await push.enable();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "PUSH_PERMISSION_DENIED"
          ? "A permissão foi bloqueada no navegador. Libere as notificações nas configurações do site."
          : "Não foi possível ativar os alertas neste aparelho.",
      );
      return;
    }
    try {
      const delivered = await push.test();
      toast.success(
        delivered > 0
          ? "Alertas ativados e teste enviado para este aparelho."
          : "Alertas ativados. Use o botão Testar para confirmar o recebimento.",
      );
    } catch {
      toast.warning("Alertas ativados. Use o botão Testar para confirmar o recebimento.");
    }
  };
  const disable = async () => {
    try {
      await push.disable();
      toast.success("Alertas desativados neste aparelho.");
    } catch {
      toast.error("Não foi possível desativar os alertas.");
    }
  };
  const test = async () => {
    try {
      const delivered = await push.test();
      toast.success(
        delivered > 0
          ? "Alerta de teste enviado."
          : "Ative os alertas neste aparelho antes de testar.",
      );
    } catch {
      toast.error("Não foi possível enviar o alerta de teste.");
    }
  };
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Alertas neste aparelho</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Receba um aviso quando um cliente enviar mensagem em uma conversa atribuída a você.
              Celulares e relógios compatíveis podem espelhar o alerta conforme suas configurações.
            </p>
            {!push.supported && (
              <p className="mt-2 text-sm text-destructive">
                Este navegador não oferece notificações push.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {push.permission === "granted" && (
            <>
              <Button variant="outline" disabled={push.busy} onClick={() => void test()}>
                <BellRing className="size-4" />
                Testar
              </Button>
              <Button variant="outline" disabled={push.busy} onClick={() => void disable()}>
                Desativar
              </Button>
            </>
          )}
          <Button disabled={!push.supported || push.busy} onClick={() => void enable()}>
            {push.busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <BellRing className="size-4" />
            )}
            {push.permission === "granted" ? "Ativar novamente" : "Ativar alertas"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
