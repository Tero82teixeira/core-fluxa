import { useEffect, useState } from "react";
import { organizationDisplayName } from "@/lib/organization-name";
import { DEMO_MODE } from "@/lib/demo";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building,
  CalendarPlus,
  ChevronDown,
  CreditCard,
  FilePlus2,
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
import { NAV_ITEMS } from "@/lib/navigation";
import { isSafeNotificationUrl } from "@/lib/notifications";
import { GlobalSearch } from "@/components/global-search";

export function AppHeader({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { displayName, memberships, membership, switchWorkspace, organizationId } = useWorkspace();
  const [searchOpen, setSearchOpen] = useState(false);

  const current = NAV_ITEMS.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  const isDetail = Boolean(current) && pathname !== current?.to;

  const notifications = useNotifications(organizationId, 5);
  const unreadQuery = useUnreadNotificationCount(organizationId);
  const markNotification = useMarkNotificationRead(organizationId);
  const unread = unreadQuery.data ?? 0;

  const openNotification = async (id: string, url: string | null) => {
    await markNotification.mutateAsync({ _notification: id });
    if (isSafeNotificationUrl(url)) await navigate({ to: url });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const quickActions = [
    { label: "Novo cliente", icon: UserPlus, to: "/clientes/novo" as const },
    { label: "Novo processo", icon: FilePlus2, to: "/processos" as const },
    { label: "Nova tarefa", icon: ListPlus, to: "/tarefas" as const },
    { label: "Adicionar documento", icon: UploadCloud, to: "/documentos" as const },
    { label: "Registrar pagamento", icon: CreditCard, to: "/financeiro" as const },
    { label: "Criar lembrete", icon: CalendarPlus, to: "/monitoramento" as const },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold sm:text-lg">
                {current?.label ?? "FLUXA"}
              </h1>
              {DEMO_MODE && (
                <span className="hidden shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:inline-flex">
                  Demonstração
                </span>
              )}
            </div>
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

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            onClick={() => setSearchOpen(true)}
            className="hidden h-10 w-56 justify-start gap-2 text-muted-foreground lg:flex xl:w-72"
          >
            <Search className="size-4.5" aria-hidden />
            <span className="truncate text-sm">Buscar em tudo…</span>
            <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 text-xs">Ctrl K</kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 lg:hidden"
            aria-label="Busca global"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-4" aria-hidden />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-10 gap-1.5">
                <Plus className="size-4" aria-hidden />
                <span className="hidden sm:inline">Criar</span>
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

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative size-10"
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
                {(notifications.data ?? []).length === 0 && (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    Nenhuma notificação por enquanto.
                  </p>
                )}
                {(notifications.data ?? []).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`block w-full px-4 py-3 text-left ${!item.read_at ? "bg-brand/5" : ""}`}
                    onClick={() => void openNotification(item.id, item.action_url)}
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
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Menu do usuário"
              >
                <Avatar className="size-8">
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSignOut}>Sair da conta</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

export async function signOutFromApp() {
  await supabase.auth.signOut();
}
