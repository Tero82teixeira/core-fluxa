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
import { NAV_GROUPS, NAV_ITEMS, navItemVisibleForRole } from "@/lib/navigation";
import { initials } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace";
import { ROLE } from "@/lib/domain";
import { canManageSubscription } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { routeVisibleForModules } from "@/lib/organization-segments";
import { toast } from "sonner";

const NAV_ICON_TONE: Record<string, string> = {
  "/meu-dia": "bg-amber-400/10 text-amber-300",
  "/central": "bg-blue-400/12 text-blue-300",
  "/clientes": "bg-cyan-400/10 text-cyan-300",
  "/saude/pacientes": "bg-emerald-400/10 text-emerald-300",
  "/saude/convenios": "bg-teal-400/10 text-teal-300",
  "/saude/autorizacoes": "bg-indigo-400/10 text-indigo-300",
  "/processos": "bg-violet-400/10 text-violet-300",
  "/documentos": "bg-indigo-400/10 text-indigo-300",
  "/monitoramento": "bg-orange-400/10 text-orange-300",
  "/tarefas": "bg-amber-400/10 text-amber-300",
  "/comunicacao": "bg-sky-400/10 text-sky-300",
  "/financeiro": "bg-emerald-400/10 text-emerald-300",
  "/relatorios": "bg-fuchsia-400/10 text-fuchsia-300",
  "/equipe": "bg-teal-400/10 text-teal-300",
  "/automacoes": "bg-purple-400/10 text-purple-300",
  "/configuracoes": "bg-slate-400/10 text-slate-300",
  "/assinatura": "bg-blue-400/12 text-blue-300",
  "/ajuda": "bg-lime-400/10 text-lime-300",
  "/novidades": "bg-pink-400/10 text-pink-300",
};

export function AppSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggleTheme } = useTheme();
  const {
    displayName,
    role,
    membership,
    loading,
    onboardingCompleted,
    onboardingExplorationEnabled,
  } = useWorkspace();
  const organizationSettings = membership?.organizations?.organization_settings;

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar
      collapsible="icon"
      variant="inset"
      className="border-0 [&_[data-sidebar=sidebar]]:overflow-hidden [&_[data-sidebar=sidebar]]:rounded-2xl [&_[data-sidebar=sidebar]]:border [&_[data-sidebar=sidebar]]:border-white/[0.06] [&_[data-sidebar=sidebar]]:shadow-2xl [&_[data-sidebar=sidebar]]:shadow-black/20"
    >
      <SidebarHeader className="border-b border-sidebar-border/80 px-3 py-4">
        <Link
          to="/meu-dia"
          onClick={closeOnMobile}
          className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20">
            <Sparkles className="size-4.5" aria-hidden />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-display text-base font-semibold tracking-tight">
                FLUXA
              </span>
              <span className="block truncate text-xs text-sidebar-foreground/50">
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
              navItemVisibleForRole(item.to, role) &&
              routeVisibleForModules(
                item.to,
                organizationSettings?.business_segment,
                organizationSettings?.enabled_modules,
              ) &&
              (item.to !== "/assinatura" || canManageSubscription(role)),
          );
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.key} className="py-1.5">
              {collapsed ? (
                <div className="mx-auto my-1 h-px w-6 bg-sidebar-border" aria-hidden />
              ) : (
                <SidebarGroupLabel className="text-[0.65rem] font-semibold tracking-[0.15em] text-sidebar-foreground/40 uppercase">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => {
                    const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                    const locked = !onboardingCompleted && !onboardingExplorationEnabled;
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
                          className="group/menu-button relative h-10 rounded-xl text-sm text-sidebar-foreground/75 hover:bg-white/[0.06] hover:text-white data-[active=true]:bg-blue-500/15 data-[active=true]:font-semibold data-[active=true]:text-blue-200 data-[active=true]:shadow-[inset_3px_0_0_0_rgb(96_165_250)]"
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

      <SidebarFooter className="gap-1 border-t border-sidebar-border/80 bg-black/[0.08] px-2 py-3">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleTheme}
              tooltip={theme === "dark" ? "Modo claro" : "Modo escuro"}
              className="h-9 gap-3 rounded-xl text-sm text-sidebar-foreground/65 hover:bg-white/[0.06] hover:text-white"
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
              className="h-9 gap-3 rounded-xl text-sm text-sidebar-foreground/65 hover:bg-rose-400/10 hover:text-rose-300"
            >
              <LogOut className="size-4.5 shrink-0" aria-hidden />
              <span className="truncate">Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div
          className={cn(
            "mt-2 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.045] p-2.5",
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
              <p className="truncate text-xs text-sidebar-foreground/50">
                {loading ? "Carregando…" : role ? ROLE[role].label : "Configurando acesso…"}
              </p>
              <p className="mt-1.5 flex min-w-0 items-center gap-1 border-t border-white/[0.07] pt-1.5 text-xs text-blue-300">
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
