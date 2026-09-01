import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, ChevronsLeft, ChevronsRight, LogOut, Moon, Sparkles, Sun } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { organizationDisplayName } from "@/lib/organization-name";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/navigation";
import { initials } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace";
import { ROLE } from "@/lib/domain";
import { canManageSubscription } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV_ICON_TONE: Record<string, string> = {
  "/central": "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  "/clientes": "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  "/processos": "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  "/documentos": "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  "/monitoramento": "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  "/tarefas": "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  "/comunicacao": "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  "/financeiro": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  "/relatorios": "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300",
  "/equipe": "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  "/automacoes": "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300",
  "/configuracoes": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "/assinatura": "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  "/ajuda": "bg-lime-100 text-lime-700 dark:bg-lime-950/60 dark:text-lime-300",
  "/novidades": "bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300",
};

export function AppSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggleTheme } = useTheme();
  const { displayName, role, membership, loading, onboardingCompleted } = useWorkspace();

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 py-4">
        <Link
          to="/central"
          onClick={closeOnMobile}
          className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4.5" aria-hidden />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-display text-base font-semibold tracking-tight">
                FLUXA
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {organizationDisplayName(membership?.organizations, "Central de processos")}
              </span>
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-2">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter(
            (item) =>
              item.group === group.key &&
              (item.to !== "/assinatura" || canManageSubscription(role)),
          );
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.key} className="py-1.5">
              {collapsed ? (
                <div className="mx-auto my-1 h-px w-6 bg-sidebar-border" aria-hidden />
              ) : (
                <SidebarGroupLabel className="text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => {
                    const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                    const locked = !onboardingCompleted;
                    const navIcon = collapsed ? (
                      <item.icon className="size-4.5 shrink-0 text-sidebar-primary" aria-hidden />
                    ) : (
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-lg transition-transform group-hover/menu-button:scale-105",
                          NAV_ICON_TONE[item.to],
                        )}
                      >
                        <item.icon className="size-4" aria-hidden />
                      </span>
                    );
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild={!locked}
                          isActive={active}
                          tooltip={item.label}
                          className="group/menu-button h-10 text-sm data-[active=true]:bg-sidebar-primary/10 data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary"
                        >
                          {locked ? (
                            <span
                              onClick={() =>
                                toast.info(
                                  "Conclua a configuração inicial da empresa para acessar este módulo.",
                                )
                              }
                            >
                              {navIcon}
                              <span className="truncate">{item.label}</span>
                            </span>
                          ) : (
                            <Link to={item.to} onClick={closeOnMobile} className="gap-3">
                              {navIcon}
                              <span className="truncate">{item.label}</span>
                              {!item.ready && !collapsed && (
                                <span className="ml-auto rounded-full border border-sidebar-border px-1.5 py-0.5 text-[0.65rem] leading-none text-muted-foreground">
                                  em breve
                                </span>
                              )}
                            </Link>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t border-sidebar-border px-2 py-3">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleTheme}
              tooltip={theme === "dark" ? "Modo claro" : "Modo escuro"}
              className="h-10 gap-3 text-sm"
            >
              {theme === "dark" ? (
                <Sun className="size-4.5 shrink-0" aria-hidden />
              ) : (
                <Moon className="size-4.5 shrink-0" aria-hidden />
              )}
              <span className="truncate">{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onSignOut}
              tooltip="Sair da conta"
              className="h-10 gap-3 text-sm"
            >
              <LogOut className="size-4.5 shrink-0" aria-hidden />
              <span className="truncate">Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div
          className={cn(
            "mt-2 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-2",
            collapsed && "justify-center border-0 bg-transparent p-0",
          )}
        >
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {loading ? "Carregando…" : role ? ROLE[role].label : "Configurando acesso…"}
              </p>
              <p className="mt-1 flex min-w-0 items-center gap-1 border-t border-sidebar-border/70 pt-1 text-xs text-sidebar-primary">
                <Building2 className="size-3 shrink-0" aria-hidden />
                <span className="shrink-0 font-medium">Empresa:</span>
                <span className="truncate">
                  {organizationDisplayName(membership?.organizations, "Configurando…")}
                </span>
              </p>
            </div>
          )}
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="Recolher menu"
                  className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
                >
                  <ChevronsLeft className="size-4.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Recolher menu</TooltipContent>
            </Tooltip>
          )}
        </div>
        {collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Expandir menu"
                className="mx-auto grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
              >
                <ChevronsRight className="size-4.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir menu</TooltipContent>
          </Tooltip>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
