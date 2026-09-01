import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Mail,
  ReceiptText,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscriptionCheckout } from "@/hooks/use-subscription-checkout";
import { useOrganizationSubscription } from "@/hooks/use-subscription";
import {
  canManageSubscription,
  canRestartKiwifyCheckout,
  FLUXA_MONTHLY_PRICE,
  FLUXA_PLAN_NAME,
  subscriptionStatusLabel,
} from "@/lib/billing";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/assinatura")({
  head: () => ({
    meta: [
      { title: "Minha assinatura — FLUXA" },
      {
        name: "description",
        content: "Plano, situação comercial, cobranças e período de acesso da FLUXA.",
      },
    ],
  }),
  component: SubscriptionPage,
});

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDate(value: string | null): string {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function statusTone(status: string | null): string {
  if (status === "active")
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
  if (status === "past_due" || status === "pending")
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
  if (status === "canceled" || status === "refunded" || status === "chargeback")
    return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200";
  return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200";
}

function DetailCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 break-words font-semibold">{value}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionPage() {
  const { organizationId, role, commercialStatus, trialDaysRemaining, trialEndsAt } =
    useWorkspace();
  const canReadSubscription = canManageSubscription(role);
  const query = useOrganizationSubscription(organizationId, canReadSubscription);
  const checkout = useSubscriptionCheckout();

  if (!canReadSubscription) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <Card>
          <CardContent className="flex gap-3 p-6">
            <ShieldCheck className="size-6 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <h1 className="font-display text-xl font-semibold">Acesso comercial restrito</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Somente o proprietário ou um administrador pode consultar os dados da assinatura.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <Card>
          <CardContent className="flex gap-3 p-6 text-sm text-muted-foreground">
            <TriangleAlert className="size-5 shrink-0 text-destructive" aria-hidden />
            Não foi possível carregar a assinatura. Tente novamente em alguns instantes.
          </CardContent>
        </Card>
      </div>
    );
  }

  const subscription = query.data;
  const status = subscription?.status ?? null;
  const isTrial = commercialStatus === "trial";
  const displayStatus = isTrial ? "Teste grátis" : subscriptionStatusLabel(status);
  const accessUntil = subscription?.access_until ?? (isTrial ? trialEndsAt : null);
  const canOpenCheckout =
    checkout.canSubscribe && canRestartKiwifyCheckout(status, subscription?.access_until ?? null);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Minha assinatura</h1>
          <p className="page-subtitle">
            Consulte o plano, as cobranças e o período de acesso da sua empresa.
          </p>
        </div>
        <Badge variant="outline" className="h-8 px-3">
          Pagamentos processados pela Kiwify
        </Badge>
      </header>

      <Card className={statusTone(isTrial ? null : status)}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-background/80 shadow-sm">
              {status === "active" ? (
                <CheckCircle2 className="size-6 text-emerald-600" aria-hidden />
              ) : (
                <ReceiptText className="size-6" aria-hidden />
              )}
            </span>
            <div>
              <p className="text-sm font-medium opacity-80">Situação atual</p>
              <p className="text-xl font-bold">{displayStatus}</p>
              {isTrial && trialDaysRemaining !== null && (
                <p className="text-sm">
                  {trialDaysRemaining}{" "}
                  {trialDaysRemaining === 1 ? "dia restante" : "dias restantes"}
                </p>
              )}
            </div>
          </div>
          {canOpenCheckout && (
            <Button onClick={() => void checkout.openCheckout()} disabled={checkout.loading}>
              <CreditCard className="size-4" aria-hidden />
              {checkout.loading
                ? "Abrindo pagamento…"
                : status === "canceled"
                  ? "Assinar novamente"
                  : "Assinar agora"}
            </Button>
          )}
        </CardContent>
      </Card>

      <section
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        aria-label="Resumo da assinatura"
      >
        <DetailCard
          icon={ReceiptText}
          label="Plano"
          value={FLUXA_PLAN_NAME}
          description={`${currency.format(FLUXA_MONTHLY_PRICE)} por mês`}
        />
        <DetailCard
          icon={CreditCard}
          label="Status"
          value={displayStatus}
          description="Atualizado pelos eventos confirmados da Kiwify"
        />
        <DetailCard
          icon={CalendarClock}
          label="Próxima cobrança"
          value={formatDate(subscription?.next_payment_at ?? null)}
          description={
            status === "canceled" ? "Não haverá renovação automática" : "Periodicidade mensal"
          }
        />
        <DetailCard
          icon={ShieldCheck}
          label="Acesso garantido até"
          value={formatDate(accessUntil)}
          description="Seus dados permanecem preservados mesmo após o bloqueio"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados de cobrança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  E-mail da assinatura
                </p>
                <p className="mt-1 break-all text-sm font-medium">
                  {subscription?.billing_email ?? "Será definido no checkout"}
                </p>
              </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Recibos, confirmações e o link seguro para gerenciar a assinatura são enviados pela
              Kiwify para esse e-mail.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gerenciamento e suporte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            {status === "past_due" && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                A renovação está pendente. A Kiwify realiza novas tentativas por até 5 dias antes da
                suspensão do acesso.
              </p>
            )}
            {status === "canceled" && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
                A renovação foi cancelada. O acesso continua disponível até o fim do período já pago
                indicado acima.
              </p>
            )}
            <p>
              Para alterar a forma de pagamento ou cancelar a renovação, use o link seguro
              <strong className="text-foreground"> Gerenciar assinatura </strong>
              recebido no e-mail da Kiwify.
            </p>
            <Button variant="outline" asChild>
              <Link to="/ajuda">Falar com o suporte FLUXA</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
