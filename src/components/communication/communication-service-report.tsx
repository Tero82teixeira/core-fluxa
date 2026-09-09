import {
  AlertTriangle,
  BookOpenCheck,
  CalendarCheck,
  Clock3,
  Inbox,
  MessagesSquare,
  Star,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [ratingFilter, setRatingFilter] = useState("all");
  const query = useCommunicationServiceReport(organizationId, from, to);
  const data = query.data;
  const filteredRatings = useMemo(
    () =>
      (data?.ratings ?? []).filter(
        (item) => ratingFilter === "all" || item.rating === Number(ratingFilter),
      ),
    [data?.ratings, ratingFilter],
  );
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
    {
      label: "Satisfação média",
      value: data.rating_count ? `${data.rating_average}/5` : "—",
      Icon: Star,
    },
    { label: "Avaliações recebidas", value: data.rating_count, Icon: Star },
    { label: "Retornos solicitados", value: data.callback_requested, Icon: CalendarCheck },
    { label: "Retornos concluídos", value: data.callback_completed, Icon: CalendarCheck },
    { label: "Resolvido pelo FAQ", value: `${data.faq_deflection_rate}%`, Icon: BookOpenCheck },
    { label: "Clientes no FAQ", value: data.faq_clients, Icon: MessagesSquare },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-title">Atendimento e autoatendimento</h2>
        <p className="page-subtitle">
          Acompanhe respostas, satisfação, retornos solicitados e dúvidas resolvidas no Meu Portal.
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
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Avaliações dos clientes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Veja a nota, o comentário e a conversa avaliada no período selecionado.
            </p>
          </div>
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="w-44" aria-label="Filtrar avaliações por nota">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as notas</SelectItem>
              {[5, 4, 3, 2, 1].map((rating) => (
                <SelectItem key={rating} value={String(rating)}>
                  {rating} estrelas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {!filteredRatings.length ? (
            <Empty text="Nenhuma avaliação encontrada com os filtros aplicados." />
          ) : (
            <div className="space-y-3">
              {filteredRatings.map((item) => (
                <article key={item.rating_id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.client_name}</p>
                      <p className="truncate text-sm text-muted-foreground">{item.subject}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className="font-semibold text-amber-500"
                        aria-label={`${item.rating} de 5 estrelas`}
                      >
                        {"★".repeat(item.rating)}
                        <span className="text-muted-foreground/30">
                          {"★".repeat(5 - item.rating)}
                        </span>
                      </p>
                      <time className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString("pt-BR")}
                      </time>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {item.comment?.trim() || "Cliente não deixou comentário."}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/comunicacao" search={{ conversa: item.thread_id }}>
                        Abrir conversa
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
