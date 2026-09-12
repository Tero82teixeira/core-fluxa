import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  FileSignature,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchPublicCommercialProposal,
  type PublicCommercialProposal,
  respondToCommercialProposal,
} from "@/hooks/use-commercial-proposals";

export const Route = createFileRoute("/proposta/$token")({
  head: () => ({
    meta: [
      { title: "Proposta comercial — FLUXA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PublicProposalPage,
});

const frequencyLabel: Record<string, string> = {
  once: "Pagamento único",
  monthly: "Cobrança mensal",
  quarterly: "Cobrança trimestral",
  yearly: "Cobrança anual",
};
const money = (value: number) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");

function PublicProposalPage() {
  const { token } = Route.useParams();
  const [proposal, setProposal] = useState<PublicCommercialProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<"accept" | "decline" | null>(null);
  const [acceptedByName, setAcceptedByName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const [chargeScheduled, setChargeScheduled] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchPublicCommercialProposal(token)
      .then((data) => {
        if (!active) return;
        setProposal(data);
        if (data?.status === "accepted") setResult("accepted");
        if (data?.status === "declined") setResult("declined");
      })
      .catch(() => active && setProposal(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const respond = async (decision: "accept" | "decline") => {
    setError("");
    if (!confirmed) {
      setError("Confirme que você leu a proposta antes de responder.");
      return;
    }
    if (decision === "accept" && acceptedByName.trim().length < 2) {
      setError("Informe o nome de quem está aceitando a proposta.");
      return;
    }
    setSending(decision);
    try {
      const response = await respondToCommercialProposal(
        token,
        decision,
        acceptedByName,
        confirmed,
      );
      setChargeScheduled(response.charge_scheduled === true);
      setResult(response.accepted ? "accepted" : "declined");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        message.includes("PROPOSAL_EXPIRED")
          ? "O prazo desta proposta terminou. Entre em contato com a empresa."
          : "Não foi possível registrar sua resposta. Tente novamente em alguns minutos.",
      );
    } finally {
      setSending(null);
    }
  };

  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando proposta" />
      </main>
    );
  if (!proposal)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-xl font-semibold">Proposta indisponível</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link não existe, foi cancelado ou ainda não foi publicado.
            </p>
          </CardContent>
        </Card>
      </main>
    );

  const unavailable = proposal.status === "expired";
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-background to-indigo-50 px-4 py-8 dark:from-slate-950 dark:via-background dark:to-blue-950/30 sm:py-14">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <FileSignature className="size-6" />
          </div>
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary">
            <Building2 className="size-4" /> {proposal.organization_name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{proposal.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {proposal.proposal_number} · válida até {date(proposal.valid_until)}
          </p>
        </header>

        <Card className="border-primary/15 shadow-lg shadow-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Proposta para {proposal.customer_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <section>
              <h2 className="text-sm font-semibold">Serviço oferecido</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {proposal.service_description}
              </p>
            </section>
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary label="Valor" value={money(proposal.amount)} />
              <Summary
                label="Forma de cobrança"
                value={frequencyLabel[proposal.billing_frequency]}
              />
              <Summary label="Primeiro vencimento" value={date(proposal.first_due_date)} />
            </div>
            <section className="rounded-xl border bg-muted/20 p-4">
              <h2 className="text-sm font-semibold">Condições comerciais</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {proposal.terms}
              </p>
            </section>

            {result === "accepted" ? (
              <Result
                icon={<CheckCircle2 className="size-12 text-emerald-600" />}
                title="Proposta aceita"
                description={
                  chargeScheduled
                    ? "O aceite foi registrado. A empresa preparará sua cobrança pelo Asaas."
                    : "O aceite foi registrado e a empresa já foi avisada."
                }
              />
            ) : result === "declined" ? (
              <Result
                icon={<XCircle className="size-12 text-muted-foreground" />}
                title="Proposta recusada"
                description="Sua resposta foi registrada e a empresa já foi avisada."
              />
            ) : unavailable ? (
              <Result
                icon={<XCircle className="size-12 text-amber-600" />}
                title="Prazo encerrado"
                description="Solicite uma nova proposta à empresa para continuar."
              />
            ) : (
              <section className="space-y-4 border-t pt-5">
                <label className="grid gap-1.5 text-sm">
                  <Label htmlFor="accepted-by">Nome de quem responde</Label>
                  <Input
                    id="accepted-by"
                    autoComplete="name"
                    maxLength={160}
                    value={acceptedByName}
                    onChange={(event) => setAcceptedByName(event.target.value)}
                    placeholder="Nome completo"
                  />
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
                  <Checkbox
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                  />
                  <span>
                    Li o serviço, o valor, a forma de cobrança e as condições desta proposta.
                  </span>
                </label>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="outline"
                    disabled={sending !== null}
                    onClick={() => respond("decline")}
                  >
                    {sending === "decline" && <Loader2 className="animate-spin" />} Recusar proposta
                  </Button>
                  <Button disabled={sending !== null} onClick={() => respond("accept")}>
                    {sending === "accept" && <Loader2 className="animate-spin" />} Aceitar proposta
                  </Button>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                  Este é um aceite comercial registrado pelo FLUXA. Assinatura eletrônica formal,
                  quando necessária, deve ser realizada pelo meio indicado pela empresa.
                </p>
              </section>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          Proposta segura disponibilizada pelo FLUXA.
        </p>
      </div>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Result({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <section className="flex flex-col items-center border-t py-6 text-center">
      {icon}
      <h2 className="mt-3 text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </section>
  );
}
