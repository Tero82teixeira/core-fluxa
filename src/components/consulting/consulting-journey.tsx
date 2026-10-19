import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { NAV_ITEMS, consultingNavigation, navItemVisibleForRole } from "@/lib/navigation";
import { routeVisibleForModules } from "@/lib/organization-segments";
export function ConsultingJourney() {
  const { membership, role } = useWorkspace();
  const settings = membership?.organizations?.organization_settings;
  if (settings?.business_segment !== "consulting_services") return null;
  const nav = consultingNavigation(
    NAV_ITEMS.filter(
      (i) =>
        navItemVisibleForRole(i.to, role) &&
        routeVisibleForModules(i.to, settings.business_segment, settings.enabled_modules),
    ),
  );
  const actions = nav.operation.filter(
    (i) =>
      ["/clientes", "/comunicacao", "/processos"].includes(i.to) || i.search?.tipo === "commercial",
  );
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Do primeiro contato à entrega</h2>
      <p className="text-sm text-muted-foreground">
        Cadastre a pessoa ou empresa, registre a necessidade no atendimento, prepare a proposta e
        organize a execução em projetos e tarefas.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((item, index) => (
          <Button key={item.to} asChild variant="outline" className="min-h-11 justify-start">
            <Link to={item.to} search={item.search ?? {}}>
              {index + 1}. {item.label}
            </Link>
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Os atalhos disponíveis seguem seu perfil. Propostas e agenda gerencial reutilizam os
        recursos comerciais e de relatórios.
      </p>
    </section>
  );
}
