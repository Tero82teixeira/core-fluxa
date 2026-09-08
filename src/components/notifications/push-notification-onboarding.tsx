import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePushNotifications } from "@/hooks/use-push-notifications";

type PushNotificationOnboardingProps = {
  organizationId: string | null;
  enabled: boolean;
};

export function PushNotificationOnboarding({
  organizationId,
  enabled,
}: PushNotificationOnboardingProps) {
  const push = usePushNotifications(organizationId);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const dismissalKey = useMemo(
    () => `fluxa:push-onboarding-dismissed:${organizationId ?? "unknown"}`,
    [organizationId],
  );

  useEffect(() => {
    if (
      !enabled ||
      !organizationId ||
      push.checking ||
      !push.supported ||
      push.active ||
      push.permission === "denied" ||
      sessionStorage.getItem(dismissalKey) === "true"
    ) {
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [dismissalKey, enabled, organizationId, push.active, push.checking, push.permission, push.supported]);

  const postpone = () => {
    sessionStorage.setItem(dismissalKey, "true");
    setOpen(false);
  };

  const activate = async () => {
    try {
      await push.enable();
      setConfirmed(true);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "PUSH_PERMISSION_DENIED"
          ? "A permissão foi bloqueada. Libere as notificações nas configurações do navegador."
          : "Não foi possível concluir a ativação dos alertas.",
      );
      return;
    }
    try {
      const delivered = await push.test();
      if (delivered > 0) toast.success("Alerta de teste enviado. Este aparelho está pronto.");
      else toast.warning("Alertas ativados. Use a tela de Notificações para repetir o teste.");
    } catch {
      toast.warning("Alertas ativados. O teste pode ser repetido na tela de Notificações.");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !confirmed) sessionStorage.setItem(dismissalKey, "true");
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {confirmed ? (
          <>
            <DialogHeader>
              <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="size-6" />
              </span>
              <DialogTitle>Alertas ativados neste aparelho</DialogTitle>
              <DialogDescription>
                Você será avisado quando um cliente enviar mensagem em uma conversa atribuída a
                você.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Smartphone className="size-6" />
              </span>
              <DialogTitle>Receba alertas de novos atendimentos</DialogTitle>
              <DialogDescription>
                Ative os avisos neste aparelho para saber rapidamente quando um cliente enviar uma
                mensagem atribuída a você. O navegador pedirá sua autorização.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <BellRing className="size-4 text-primary" />
                Você continua no controle
              </span>
              <p className="mt-1">
                Os alertas podem ser desativados a qualquer momento na opção Notificações do menu.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:space-x-0">
              <Button variant="ghost" disabled={push.busy} onClick={postpone}>
                Agora não
              </Button>
              <Button disabled={push.busy} onClick={() => void activate()}>
                {push.busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                Ativar notificações
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
