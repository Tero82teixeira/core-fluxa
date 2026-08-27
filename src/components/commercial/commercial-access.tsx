import { Ban, Clock3, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CommercialAccess } from "@/lib/commercial";

export function CommercialAccessBlocked({
  access,
  onSignOut,
  signingOut,
}: {
  access: CommercialAccess;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const expired = access.reason === "expired";
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-5">
      <Card className="w-full max-w-lg shadow-panel">
        <CardContent className="space-y-5 p-7 text-center sm:p-9">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-warning/15 text-warning-foreground">
            {expired ? <Clock3 className="size-7" /> : <Ban className="size-7" />}
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold">
              {expired ? "Seu período de teste terminou" : "Acesso temporariamente suspenso"}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {expired
                ? "Seus dados continuam preservados. Fale com o responsável comercial do Core Fluxa para ativar sua empresa e continuar usando o sistema."
                : "Seus dados permanecem protegidos. Fale com o responsável comercial do Core Fluxa para verificar a situação da empresa."}
            </p>
          </div>
          <Button variant="outline" onClick={onSignOut} disabled={signingOut}>
            <LogOut className="size-4" />
            Sair da conta
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

