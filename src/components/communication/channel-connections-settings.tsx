import { Mail, MessageCircleMore, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type CommunicationChannelConnection,
  useCommunicationChannelConnections,
  useSaveCommunicationChannelConnection,
} from "@/hooks/use-communication-channels";
import { describeError } from "@/lib/errors";
import { formatDate } from "@/lib/format";

type Draft = { senderIdentifier: string; displayName: string; isEnabled: boolean };
const empty: Draft = { senderIdentifier: "", displayName: "", isEnabled: false };
const statusLabel = {
  pending: "Aguardando teste",
  active: "Ativo",
  paused: "Pausado",
  error: "Verificar configuração",
};

export function ChannelConnectionsSettings({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const query = useCommunicationChannelConnections(organizationId, canManage);
  const save = useSaveCommunicationChannelConnection(organizationId);
  const [whatsapp, setWhatsapp] = useState<Draft>(empty);
  const [email, setEmail] = useState<Draft>(empty);

  useEffect(() => {
    const whatsappConnection = query.data?.find((item) => item.channel === "whatsapp");
    const emailConnection = query.data?.find((item) => item.channel === "email");
    if (whatsappConnection)
      setWhatsapp({
        senderIdentifier: whatsappConnection.sender_identifier,
        displayName: whatsappConnection.display_name,
        isEnabled: whatsappConnection.is_enabled,
      });
    if (emailConnection)
      setEmail({
        senderIdentifier: emailConnection.sender_identifier,
        displayName: emailConnection.display_name,
        isEnabled: emailConnection.is_enabled,
      });
  }, [query.data]);
  if (!canManage) return null;

  const persist = async (channel: "whatsapp" | "email", draft: Draft) => {
    if (!draft.senderIdentifier.trim() || !draft.displayName.trim())
      return toast.error("Informe a identificação do canal e o nome de exibição.");
    try {
      await save.mutateAsync({ channel, ...draft });
      toast.success(`${channel === "whatsapp" ? "WhatsApp" : "E-mail"} atualizado.`);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Canais oficiais</CardTitle>
        <p className="text-sm text-muted-foreground">
          Conecte o WhatsApp Cloud API e o e-mail Resend. As credenciais permanecem nos segredos do
          Supabase.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 lg:grid-cols-2">
        <ConnectionCard
          channel="whatsapp"
          title="WhatsApp Cloud API"
          icon={<MessageCircleMore className="size-5" />}
          identifierLabel="ID do número no WhatsApp"
          identifierPlaceholder="Ex.: 123456789012345"
          draft={whatsapp}
          setDraft={setWhatsapp}
          connection={query.data?.find((item) => item.channel === "whatsapp")}
          saving={save.isPending}
          onSave={() => void persist("whatsapp", whatsapp)}
        />
        <ConnectionCard
          channel="email"
          title="E-mail com Resend"
          icon={<Mail className="size-5" />}
          identifierLabel="Endereço remetente e caixa de entrada"
          identifierPlaceholder="atendimento@suaempresa.com.br"
          draft={email}
          setDraft={setEmail}
          connection={query.data?.find((item) => item.channel === "email")}
          saving={save.isPending}
          onSave={() => void persist("email", email)}
        />
      </CardContent>
    </Card>
  );
}

function ConnectionCard({
  title,
  icon,
  identifierLabel,
  identifierPlaceholder,
  draft,
  setDraft,
  connection,
  saving,
  onSave,
}: {
  channel: "whatsapp" | "email";
  title: string;
  icon: React.ReactNode;
  identifierLabel: string;
  identifierPlaceholder: string;
  draft: Draft;
  setDraft: (value: Draft) => void;
  connection?: CommunicationChannelConnection;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          {icon}
          {title}
        </div>
        {connection && (
          <Badge
            variant={
              connection.status === "active"
                ? "secondary"
                : connection.status === "error"
                  ? "destructive"
                  : "outline"
            }
          >
            {statusLabel[connection.status]}
          </Badge>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>{identifierLabel}</Label>
        <Input
          value={draft.senderIdentifier}
          placeholder={identifierPlaceholder}
          onChange={(event) => setDraft({ ...draft, senderIdentifier: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Nome de exibição</Label>
        <Input
          value={draft.displayName}
          placeholder="Ex.: Atendimento FLUXA"
          onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={draft.isEnabled}
          onCheckedChange={(isEnabled) => setDraft({ ...draft, isEnabled })}
        />
        <Label>Canal habilitado</Label>
      </div>
      {connection?.last_error_code && (
        <p className="text-xs text-destructive">Último erro: {connection.last_error_code}</p>
      )}
      {(connection?.last_inbound_at || connection?.last_outbound_at) && (
        <p className="text-xs text-muted-foreground">
          Última atividade: {formatDate(connection.last_inbound_at ?? connection.last_outbound_at!)}
        </p>
      )}
      <Button className="w-full" onClick={onSave} disabled={saving}>
        <Save className="size-4" /> Salvar canal
      </Button>
    </section>
  );
}
