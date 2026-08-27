import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Clock3, Loader2, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useIsPlatformAdmin,
  useManagePlatformOrganization,
  usePlatformOrganizations,
  type PlatformOrganization,
} from "@/hooks/use-commercial";
import { COMMERCIAL_STATUS_LABEL, type CommercialStatus } from "@/lib/commercial";
import { describeError } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/administracao")({
  head: () => ({
    meta: [
      { title: "Administração da plataforma — FLUXA" },
      { name: "description", content: "Controle de empresas e períodos de teste do Core Fluxa." },
    ],
  }),
  component: PlatformAdministration,
});

const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

function isExpired(row: PlatformOrganization) {
  return row.subscription_status === "trial"
    && (!row.trial_ends_at || new Date(row.trial_ends_at).getTime() <= Date.now());
}

function statusLabel(row: PlatformOrganization) {
  return isExpired(row) ? "Teste vencido" : COMMERCIAL_STATUS_LABEL[row.subscription_status];
}

function PlatformAdministration() {
  const { organizationId } = useWorkspace();
  const admin = useIsPlatformAdmin();
  const organizations = usePlatformOrganizations(Boolean(admin.data));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CommercialStatus | "all" | "expired">("all");

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (organizations.data ?? []).filter((row) => {
      const matchesSearch = !term || [
        row.organization_name,
        row.owner_name,
        row.owner_email,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
      const matchesStatus = status === "all"
        || (status === "expired" ? isExpired(row) : row.subscription_status === status);
      return matchesSearch && matchesStatus;
    });
  }, [organizations.data, search, status]);

  if (admin.isLoading) return <Loading label="Verificando acesso à plataforma…" />;
  if (!admin.data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardContent className="space-y-2 p-8 text-center">
            <ShieldCheck className="mx-auto size-9 text-muted-foreground" />
            <h1 className="font-display text-xl font-semibold">Acesso restrito</h1>
            <p className="text-sm text-muted-foreground">
              Esta área está disponível somente para a administração comercial do Core Fluxa.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (organizations.isLoading) return <Loading label="Carregando empresas…" />;

  const all = organizations.data ?? [];
  const trials = all.filter((row) => row.subscription_status === "trial" && !isExpired(row)).length;
  const expired = all.filter(isExpired).length;
  const active = all.filter((row) => row.subscription_status === "active").length;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Administração da plataforma</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe empresas, testes comerciais e liberações de acesso.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary icon={Building2} label="Empresas" value={all.length} />
        <Summary icon={Clock3} label="Em teste" value={trials} />
        <Summary icon={ShieldCheck} label="Ativas" value={active} />
        <Summary icon={Clock3} label="Testes vencidos" value={expired} />
      </section>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle>Empresas cadastradas</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-64">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Empresa, responsável ou e-mail"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className={selectClass}
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              aria-label="Filtrar situação comercial"
            >
              <option value="all">Todas as situações</option>
              <option value="trial">Em teste</option>
              <option value="expired">Teste vencido</option>
              <option value="active">Ativas</option>
              <option value="suspended">Suspensas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {!rows.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma empresa encontrada nesta seleção.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {[
                      "Empresa",
                      "Responsável",
                      "Situação",
                      "Fim do teste",
                      "Uso",
                      "Criada em",
                      "Ações",
                    ].map((label) => <th className="p-3 font-medium" key={label}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <OrganizationRow
                      key={row.organization_id}
                      row={row}
                      currentOrganizationId={organizationId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizationRow({
  row,
  currentOrganizationId,
}: {
  row: PlatformOrganization;
  currentOrganizationId: string | null;
}) {
  const manage = useManagePlatformOrganization();
  const execute = async (action: "activate" | "extend_trial" | "suspend", days?: number) => {
    try {
      await manage.mutateAsync({ organizationId: row.organization_id, action, days });
      toast.success(
        action === "activate"
          ? "Empresa ativada."
          : action === "extend_trial"
            ? `Teste estendido por ${days} dias.`
            : "Empresa suspensa.",
      );
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <tr className="border-b align-top last:border-0">
      <td className="p-3">
        <p className="font-medium">{row.organization_name}</p>
        <p className="text-xs text-muted-foreground">{row.plan_code}</p>
      </td>
      <td className="p-3">
        <p>{row.owner_name || "Não informado"}</p>
        <p className="text-xs text-muted-foreground">{row.owner_email || "—"}</p>
      </td>
      <td className="p-3"><Badge variant={isExpired(row) ? "destructive" : "secondary"}>{statusLabel(row)}</Badge></td>
      <td className="p-3">{formatDate(row.trial_ends_at)}</td>
      <td className="p-3">
        <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {row.member_count}</span>
        <span className="ml-3">{row.client_count} clientes</span>
      </td>
      <td className="p-3">{formatDate(row.organization_created_at)}</td>
      <td className="p-3">
        <div className="flex flex-wrap gap-2">
          <ConfirmAction
            label="+7 dias"
            title="Estender teste por 7 dias?"
            description={`A empresa “${row.organization_name}” terá mais 7 dias de acesso.`}
            disabled={manage.isPending}
            onConfirm={() => void execute("extend_trial", 7)}
          />
          {row.subscription_status !== "active" && (
            <ConfirmAction
              label="Ativar"
              title="Ativar esta empresa?"
              description="O prazo de teste deixará de bloquear o acesso. A cobrança continuará manual nesta etapa."
              disabled={manage.isPending}
              onConfirm={() => void execute("activate")}
            />
          )}
          {row.subscription_status !== "suspended" && row.organization_id !== currentOrganizationId && (
            <ConfirmAction
              label="Suspender"
              title="Suspender o acesso?"
              description="Os dados serão preservados, mas os usuários não conseguirão entrar na operação."
              destructive
              disabled={manage.isPending}
              onConfirm={() => void execute("suspend")}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function ConfirmAction({
  label,
  title,
  description,
  destructive = false,
  disabled,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  destructive?: boolean;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={destructive ? "destructive" : "outline"} disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
