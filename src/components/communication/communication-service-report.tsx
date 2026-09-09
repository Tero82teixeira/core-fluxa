import { AlertTriangle, BookOpenCheck, Clock3, Inbox, MessagesSquare, Send } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCommunicationServiceReport } from "@/hooks/use-communication-service-report";

const channelLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  telefone: "Telefone",
  presencial: "Presencial",
  interno: "Interno",
  outro: "Outro",
};

export function CommunicationServiceReport({
  organizationId,
  from,
  to,
}: {
  organizationId: string;
  from: Date;
  to: Date;
}) {
  const query = useCommunicationServiceReport(organizationId, from, to);
  const data = query.data;
  if (query.isLoading)
    return (
      <div className="panel p-8 text-center text-muted-foreground">
        Carregando atendimento e autoatendimento…
      </div>
    );
  if (query.isError || !data)
    return (
      <div role="alert" className="panel p-6 text-destructive">
        <AlertTriangle className="mr-2 inline size-4" />
        Não foi possível carregar os indicadores de atendimento.
      </div>
    );
  const channels = Object.entries(data.by_channel ?? {}).map(([name, value]) => ({
    name: channelLabels[name] ?? name,
    value,
  }));
  const resolutionRate = data.conversations
    ? Math.round((data.resolved / data.conversations) * 100)
    : 0;
  const cards = [
    { label: "Conversas no período", value: data.conversations, Icon: MessagesSquare },
    { label: "Taxa de resolução", value: `${resolutionRate}%`, Icon: BookOpenCheck },
    {
      label: "Primeira resposta média",
      value: formatMinutes(data.average_first_response_minutes),
      Icon: Clock3,
    },
    { label: "Aguardando equipe", value: data.waiting_team, Icon: Inbox },
    { label: "Mensagens recebidas", value: data.channel_inbound, Icon: Inbox },
    { label: "Mensagens enviadas", value: data.channel_outbound, Icon: Send },
    { label: "Resolvido pelo FAQ", value: `${data.faq_deflection_rate}%`, Icon: BookOpenCheck },
    { label: "Clientes no FAQ", value: data.faq_clients, Icon: MessagesSquare },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-title">Atendimento e autoatendimento</h2>
        <p className="page-subtitle">
          Acompanhe resposta da equipe, canais conectados e dúvidas resolvidas no Meu Portal.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, Icon }) => (
          <Card key={label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="metric-value">
              {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Conversas por canal</CardTitle>
          </CardHeader>
          <CardContent>
            {channels.length ? (
              <div className="h-64" role="img" aria-label="Conversas por canal">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channels}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" name="Conversas" fill="#176b5b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty text="Nenhuma conversa no período." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Resultado do autoatendimento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label="Visualizações" value={data.faq_views} />
            <Metric label="Ajudou" value={data.faq_helpful} />
            <Metric label="Não ajudou" value={data.faq_not_helpful} />
            <Metric label="Virou atendimento" value={data.faq_escalated} />
          </CardContent>
        </Card>
      </div>
      {(data.channel_failed > 0 || data.channel_pending_match > 0) && (
        <Card className="border-amber-300/70">
          <CardContent className="flex flex-wrap gap-6 p-4 text-sm">
            <span>
              <strong>{data.channel_failed}</strong> envio(s) com falha
            </span>
            <span>
              <strong>{data.channel_pending_match}</strong> mensagem(ns) aguardando identificação
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
function formatMinutes(value: number) {
  if (!value) return "—";
  if (value < 60) return `${Math.round(value)} min`;
  return `${(value / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}
