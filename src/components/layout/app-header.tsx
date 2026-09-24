import { useEffect, useState } from "react";
import { organizationDisplayName } from "@/lib/organization-name";
import { DEMO_MODE } from "@/lib/demo";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building,
  CalendarPlus,
  ChevronDown,
  Clock3,
  CreditCard,
  FilePlus2,
  LifeBuoy,
  ListPlus,
  Plus,
  Search,
  UploadCloud,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import {
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/hooks/use-notifications";
import { initials, relativeTime } from "@/lib/format";
import { NAV_ITEMS, navItemVisibleForRole } from "@/lib/navigation";
import { isFocusedHealthWorkspace, routeVisibleForModules } from "@/lib/organization-segments";
import {
  notificationDestination,
  visibleForFocusedHealth,
  type Notification,
} from "@/lib/notifications";
import { GlobalSearch } from "@/components/global-search";
import { useSubscriptionCheckout } from "@/hooks/use-subscription-checkout";
import { usePlatformSupportOpenCount } from "@/hooks/use-platform-support";

export function AppHeader({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const {
    displayName,
    memberships,
    membership,
    switchWorkspace,
    organizationId,
    commercialStatus,
    trialDaysRemaining,
    platformAdmin,
    role,
    can,
  } = useWorkspace();
  const [searchOpen, setSearchOpen] = useState(false);
  const organizationSettings = membership?.organizations?.organization_settings;
  const focusedHealth = isFocusedHealthWorkspace(organizationSettings);
  const subscription = useSubscriptionCheckout();
  const platformSupport = usePlatformSupportOpenCount(platformAdmin);

  const current = NAV_ITEMS.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  const CurrentIcon = current?.icon;
  const isDetail = Boolean(current) && pathname !== current?.to;

  const notifications = useNotifications(organizationId, 5, focusedHealth);
  const unreadQuery = useUnreadNotificationCount(organizationId, focusedHealth);
  const markNotification = useMarkNotificationRead(organizationId);
  const recentNotifications = (notifications.data ?? []).filter(
    (item) => !focusedHealth || visibleForFocusedHealth(item),
  );
  const unread = unreadQuery.data ?? 0;

  const openNotification = async (notification: Notification) => {
    await markNotification.mutateAsync({ _notification: notification.id });
    const destination = notificationDestination(notification);
    if (destination) await navigate({ to: destination });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!focusedHealth && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusedHealth]);

  const operationalRole = Boolean(
    role && ["superadmin", "proprietario", "administrador", "gestor", "operacional"].includes(role),
  );
  const taskRole = Boolean(operationalRole || role === "atendimento");
  const financeRole = Boolean(
    role && ["superadmin", "proprietario", "administrador", "financeiro"].includes(role),
  );
  const generalQuickActions = [
    {
      label: "Novo cliente",
      icon: UserPlus,
      to: "/clientes/novo" as const,
      visible: can("clients.create"),
    },
    {
      label: "Novo processo",
      icon: FilePlus2,
      to: "/processos" as const,
      visible: can("processes.create"),
    },
    { label: "Nova tarefa", icon: ListPlus, to: "/tarefas" as const, visible: taskRole },
    {
      label: "Adicionar documento",
      icon: UploadCloud,
      to: "/documentos" as const,
      visible: operationalRole,
    },
    {
      label: "Registrar pagamento",
      icon: CreditCard,
      to: "/financeiro" as const,
      visible: financeRole,
    },
    {
      label: "Criar lembrete",
      icon: CalendarPlus,
      to: "/monitoramento" as const,
      visible: operationalRole,
    },
  ].filter((action) => action.visible);
  const healthQuickActions = [
    { label: "Pacientes", icon: UserPlus, to: "/saude/pacientes" as const },
    { label: "Agenda", icon: CalendarPlus, to: "/saude/agenda" as const },
    { label: "Contas Médicas", icon: CreditCard, to: "/saude/contas-medicas" as const },
  ].filter(
    (action) =>
      navItemVisibleForRole(action.to, role) &&
      routeVisibleForModules(
        action.to,
        organizationSettings?.business_segment,
        organizationSettings?.enabled_modules,
        focusedHealth,
      ),
  );
  const quickActions = focusedHealth ? healthQuickActions : generalQuickActions;

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-card/90 shadow-[0_1px_18px_-12px_rgba(15,23,42,0.45)] backdrop-blur-xl">
      <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-5 lg:px-6">
        <div className="flex min-w-0 flex-1 basis-40 items-center gap-2.5">
          <SidebarTrigger className="size-9 shrink-0 rounded-xl border border-border/80 bg-background shadow-sm hover:bg-muted" />
          {CurrentIcon && (
            <span className="hidden size-9 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary sm:grid">
              <CurrentIcon className="size-4.5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 flex-1 truncate font-display text-sm font-semibold tracking-tight sm:text-base">
                {current?.label ?? "FLUXA"}
              </h1>
              {DEMO_MODE && (
                <span className="hidden shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:inline-flex">
                  Demonstração
                </span>
              )}
            </div>
            {!isDetail && (
              <p className="hidden truncate text-[0.68rem] text-muted-foreground sm:block">
                {organizationDisplayName(membership?.organizations, "Sua organização")}
              </p>
            )}
            {isDetail && current && (
              <Breadcrumb className="hidden sm:block">
                <BreadcrumbList className="text-xs">
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to={current.to}>{current.label}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Detalhe</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>
        </div>

        <div className="flex w-full max-w-full min-w-0 flex-wrap items-center justify-end gap-1.5 2xl:w-auto">
          {commercialStatus === "trial" && trialDaysRemaining !== null && (
            <Badge
              variant="outline"
              className="hidden h-9 gap-1.5 whitespace-nowrap border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 text-amber-950 shadow-sm sm:inline-flex dark:border-amber-800/70 dark:from-amber-950/70 dark:to-orange-950/50 dark:text-amber-100"
            >
              <Clock3 className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
              <span className="font-semibold">Teste grátis</span>
              <span className="rounded-full bg-amber-500 px-2 py-0.5 font-bold text-white shadow-sm">
                {trialDaysRemaining} {trialDaysRemaining === 1 ? "dia" : "dias"}
              </span>
              <span className="hidden xl:inline">restantes</span>
            </Badge>
          )}
          {commercialStatus === "trial" && subscription.canSubscribe && (
            <Button
              className="hidden h-9 gap-2 whitespace-nowrap border-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.85)] transition-all duration-200 hover:-translate-y-0.5 hover:from-blue-700 hover:to-indigo-700 hover:shadow-[0_10px_24px_-8px_rgba(37,99,235,0.95)] md:inline-flex"
              disabled={subscription.loading}
              onClick={() => void subscription.openCheckout()}
            >
              <CreditCard className="size-4" aria-hidden />
              {subscription.loading ? "Abrindo…" : "Assinar agora"}
            </Button>
          )}
          {!focusedHealth && (
            <>
              <Button
                variant="outline"
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar em tudo"
                className="hidden h-10 w-44 justify-start gap-2 rounded-xl border-border/70 bg-muted/25 text-muted-foreground shadow-none hover:bg-muted/50 lg:flex xl:w-56"
              >
                <Search className="size-4.5" aria-hidden />
                <span className="text-sm">Buscar</span>
                <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 text-xs">
                  Ctrl K
                </kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 rounded-xl lg:hidden"
                aria-label="Busca global"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="size-4" aria-hidden />
              </Button>
            </>
          )}

          {quickActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-10 gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/20 hover:from-blue-500 hover:to-blue-500">
                  <Plus className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{focusedHealth ? "Saúde" : "Criar"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {quickActions.map((action) => (
                  <DropdownMenuItem key={action.label} onSelect={() => navigate({ to: action.to })}>
                    <action.icon className="size-4" aria-hidden />
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative size-10 rounded-xl border border-transparent hover:border-border/70 hover:bg-muted/50"
                aria-label="Central de notificações"
              >
                <Bell className="size-4" aria-hidden />
                {unread > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-5 text-destructive-foreground"
                    aria-label={`${unread} não lidas`}
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Notificações</p>
                <Badge variant="secondary">{unread} novas</Badge>
              </div>
              <div className="max-h-80 divide-y divide-border overflow-y-auto">
                {recentNotifications.length === 0 && (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    Nenhuma notificação por enquanto.
                  </p>
                )}
                {recentNotifications.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`block w-full px-4 py-3 text-left ${!item.read_at ? "bg-brand/5" : ""}`}
                    onClick={() => void openNotification(item)}
                  >
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {relativeTime(item.created_at)}
                    </p>
                  </button>
                ))}
              </div>
              <div className="border-t p-2">
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/notificacoes">Ver todas</Link>
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {memberships.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 max-w-48 gap-1.5 px-2 sm:max-w-64 sm:px-3"
                  aria-label={`Workspace atual: ${organizationDisplayName(membership?.organizations)}`}
                >
                  <Building className="size-4" aria-hidden />
                  <span className="hidden min-w-0 sm:inline">
                    <span className="hidden text-muted-foreground lg:inline">
                      Workspace atual:{" "}
                    </span>
                    <span className="font-medium">
                      {organizationDisplayName(membership?.organizations)}
                    </span>
                  </span>
                  <ChevronDown className="size-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Trocar de workspace</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {memberships.map((item) => (
                  <DropdownMenuItem
                    key={item.organization_id}
                    onSelect={() => {
                      switchWorkspace(item.organization_id);
                      toast.success("Workspace alterado.");
                    }}
                  >
                    {organizationDisplayName(item.organizations)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-xl p-0.5 outline-none ring-1 ring-border transition-shadow hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Menu do usuário"
              >
                <Avatar className="size-8 rounded-[0.65rem]">
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/configuracoes" })}>
                Configurações
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate({ to: "/ajuda" })}>
                Ajuda e suporte
              </DropdownMenuItem>
              {platformAdmin && (
                <>
                  <DropdownMenuItem onSelect={() => navigate({ to: "/administracao-plataforma" })}>
                    Administração da plataforma
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate({ to: "/suporte-plataforma" })}>
                    <LifeBuoy className="size-4" aria-hidden />
                    Central de suporte
                    {(platformSupport.data ?? 0) > 0 && (
                      <Badge className="ml-auto h-5 min-w-5 justify-center px-1.5">
                        {platformSupport.data}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSignOut}>Sair da conta</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!focusedHealth && <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />}
    </header>
  );
}

export async function signOutFromApp() {
  await supabase.auth.signOut();
}
