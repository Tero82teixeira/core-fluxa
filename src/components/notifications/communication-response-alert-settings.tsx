import { useEffect, useState } from "react";
import { BellRing, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCommunicationResponseAlertSettings,
  useUpdateCommunicationResponseAlertSettings,
} from "@/hooks/use-communication-response-alerts";

export function CommunicationResponseAlertSettings({
  organizationId,
  canEdit,
}: {
  organizationId: string | null;
  canEdit: boolean;
}) {
  const query = useCommunicationResponseAlertSettings(organizationId);
  const update = useUpdateCommunicationResponseAlertSettings(organizationId);
  const [first, setFirst] = useState(15);
  const [escalation, setEscalation] = useState(30);

  useEffect(() => {
    if (!query.data) return;
    setFirst(query.data.first_reminder_minutes);
    setEscalation(query.data.escalation_minutes);
  }, [query.data]);

  const save = async () => {
    if (!Number.isInteger(first) || first < 5 || first > 720) {
      toast.error("O primeiro lembrete deve ficar entre 5 e 720 minutos.");
      return;
    }
    if (!Number.isInteger(escalation) || escalation < 10 || escalation > 1440 || escalation <= first) {
      toast.error("O aviso à gestão deve ser posterior ao primeiro lembrete.");
      return;
    }
    try {
      await update.mutateAsync({
        first_reminder_minutes: first,
        escalation_minutes: escalation,
      });
      toast.success("Prazos de resposta atualizados.");
    } catch {
      toast.error("Não foi possível salvar os prazos de resposta.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-4 text-primary" />
          Resposta às mensagens do Portal do Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          O responsável recebe o primeiro lembrete. Se o cliente continuar sem resposta, a gestão
          também será avisada. Uma resposta da empresa encerra automaticamente os alertas.
        </p>
        {query.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar estes prazos.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="communication-first-reminder">Lembrar responsável após (minutos)</Label>
              <Input
                id="communication-first-reminder"
                type="number"
                min={5}
                max={720}
                value={first}
                disabled={!canEdit || query.isLoading || update.isPending}
                onChange={(event) => setFirst(Number(event.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="communication-escalation">Avisar gestão após (minutos)</Label>
              <Input
                id="communication-escalation"
                type="number"
                min={10}
                max={1440}
                value={escalation}
                disabled={!canEdit || query.isLoading || update.isPending}
                onChange={(event) => setEscalation(Number(event.target.value))}
              />
            </div>
          </div>
        )}
        {canEdit && (
          <div className="flex justify-end">
            <Button disabled={query.isLoading || query.isError || update.isPending} onClick={() => void save()}>
              {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvar prazos
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
