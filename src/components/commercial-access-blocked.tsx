import { Clock3, ShieldAlert } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWorkspace } from "@/lib/workspace";

export function CommercialAccessBlocked({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate();
  const { commercialStatus, platformAdmin } = useWorkspace();
  const expired = commercialStatus === "expired";
  const Icon = expired ? Clock3 : ShieldAlert;

  return (
    <div className="grid min-h-dvh place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardContent className="space-y-6 p-6 text-center sm:p-8">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-warning/15 text-warning-foreground">
            <Icon className="size-7" aria-hidden />
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold">
              {expired ? "Seu período de teste terminou" : "Acesso da empresa suspenso"}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {expired
                ? "Os dados da empresa continuam preservados. Fale com a equipe FLUXA para ativar o acesso e continuar de onde parou."
                : "Os dados continuam preservados, mas os módulos ficam bloqueados enquanto a situação comercial estiver suspensa."}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {platformAdmin && (
              <Button onClick={() => navigate({ to: "/administracao-plataforma" })}>
                Administração da plataforma
              </Button>
            )}
            <Button variant="outline" onClick={onSignOut}>
              Sair da conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
