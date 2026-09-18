import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CreditCard,
  Sparkles,
  UserPlus,
  UsersRound,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAsaasConnection } from "@/hooks/use-asaas";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

const db = supabase as any;

type SetupRoute = "/configuracoes" | "/clientes/novo" | "/equipe" | "/financeiro";

type SetupStep = {
  key: string;
  title: string;
  description: string;
  action: string;
  to: SetupRoute;
  complete: boolean;
  optional?: boolean;
  icon: typeof Building2;
};

async function countRows(
  table: "clients" | "organization_members" | "financial_accounts",
  organizationId: string,
) {
  let query = db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (table === "clients" || table === "financial_accounts") {
    query = query.is("archived_at", null);
  }
  if (table === "organization_members") {
    query = query.eq("is_active", true);
  }
  if (table === "financial_accounts") {
    query = query.eq("is_active", true);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export function GettingStartedCard() {
  const { organizationId, user, role, onboardingCompleted } = useWorkspace();
  const management =
    role === "proprietario" || role === "administrador" || role === "superadmin";
  const status = useQuery({
    enabled: Boolean(organizationId && management),
    queryKey: ["getting-started", organizationId],
    queryFn: async () => {
      const [clients, members, accounts] = await Promise.all([
        countRows("clients", organizationId!),
        countRows("organization_members", organizationId!),
        countRows("financial_accounts", organizationId!),
      ]);
      return { clients, members, accounts };
    },
  });
  const asaas = useAsaasConnection(management ? organizationId : null);
  const storageKey = `fluxa-getting-started:${user?.id ?? "guest"}:${organizationId ?? "none"}`;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === "collapsed");
    } catch {
      setCollapsed(false);
    }
  }, [storageKey]);

  const changeCollapsed = (value: boolean) => {
    setCollapsed(value);
    try {
      if (value) window.localStorage.setItem(storageKey, "collapsed");
      else window.localStorage.removeItem(storageKey);
    } catch {
      /* O guia continua funcionando quando o armazenamento do navegador está indisponível. */
    }
  };

  const steps = useMemo<SetupStep[]>(
    () => [
      {
        key: "company",
        title: "Complete os dados da empresa",
        description: "Nome, documento, contato e informações da operação.",
        action: "Revisar empresa",
        to: "/configuracoes",
        complete: onboardingCompleted,
        icon: Building2,
      },
      {
        key: "client",
        title: "Cadastre o primeiro cliente",
        description: "Crie a base para processos, tarefas, propostas e cobranças.",
        action: "Cadastrar cliente",
        to: "/clientes/novo",
        complete: (status.data?.clients ?? 0) > 0,
        icon: UserPlus,
      },
      {
        key: "team",
        title: "Convide sua equipe",
        description: "Cada pessoa verá somente o necessário para sua função.",
        action: "Gerenciar equipe",
        to: "/equipe",
        complete: (status.data?.members ?? 0) > 1,
        optional: true,
        icon: UsersRound,
      },
      {
        key: "finance",
        title: "Prepare o financeiro",
        description: "Crie ou confirme a conta que receberá os pagamentos.",
        action: "Abrir financeiro",
        to: "/financeiro",
        complete: (status.data?.accounts ?? 0) > 0,
        icon: Wallet,
      },
      {
        key: "asaas",
        title: "Conecte o Asaas",
        description: "A chave é informada uma única vez e fica protegida no FLUXA.",
        action: "Configurar Asaas",
        to: "/configuracoes",
        complete: asaas.data?.status === "connected",
        optional: true,
        icon: CreditCard,
      },
    ],
    [
      asaas.data?.status,
      onboardingCompleted,
      status.data?.accounts,
      status.data?.clients,
      status.data?.members,
    ],
  );

  if (!management || !organizationId) return null;

  const completed = steps.filter((step) => step.complete).length;
  const requiredComplete = steps.filter((step) => !step.optional).every((step) => step.complete);
  const loading = status.isLoading || asaas.isLoading;

  if (collapsed) {
    return (
      <Card className="border-primary/20 bg-primary/[0.025] shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">Primeiros passos</p>
              <p className="text-sm text-muted-foreground">
                {loading ? "Verificando sua configuração…" : `${completed} de ${steps.length} etapas concluídas`}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => changeCollapsed(false)}>
            <ChevronDown className="size-4" aria-hidden />
            Continuar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/25 shadow-sm">
      <CardHeader className="border-b bg-gradient-to-r from-primary/[0.09] to-transparent">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-5 text-primary" aria-hidden />
              Primeiros passos no FLUXA
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Siga esta sequência para deixar a empresa pronta sem precisar conhecer todos os módulos.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => changeCollapsed(true)}>
            <ChevronUp className="size-4" aria-hidden />
            Ocultar por agora
          </Button>
        </div>
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium">
              {loading ? "Verificando…" : `${completed} de ${steps.length} etapas concluídas`}
            </span>
            {requiredComplete && (
              <span className="font-medium text-emerald-700 dark:text-emerald-300">
                Configuração essencial concluída
              </span>
            )}
          </div>
          <Progress value={(completed / steps.length) * 100} className="h-2" />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:p-5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div
              key={step.key}
              className={cn(
                "grid gap-3 rounded-xl border p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center",
                step.complete && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
              )}
            >
              <span className="relative grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Icon className="size-4.5" aria-hidden />
                <span className="absolute -left-2 -top-2 grid size-5 place-items-center rounded-full bg-background text-[10px] font-bold shadow-sm">
                  {index + 1}
                </span>
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {step.complete ? (
                    <CheckCircle2 className="size-4 text-emerald-600" aria-label="Concluído" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" aria-label="Pendente" />
                  )}
                  {step.title}
                  {step.optional && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Opcional
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
              </div>
              <Button
                asChild
                size="sm"
                variant={step.complete ? "ghost" : "outline"}
                className="justify-self-start sm:justify-self-end"
              >
                <Link to={step.to}>{step.complete ? "Revisar" : step.action}</Link>
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
