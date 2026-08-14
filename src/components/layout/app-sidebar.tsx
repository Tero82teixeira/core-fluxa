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
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/navigation";
import { initials } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace";
import { ROLE } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
              <span className="block truncate font-display text-base font-semibold tracking-tight">FLUXA</span>
              <span className="block truncate text-xs text-muted-foreground">
                {membership?.organizations?.trade_name ?? "Central de processos"}
              </span>
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-2">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((item) => item.group === group.key);
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
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild={!locked}
                          isActive={active}
                          tooltip={item.label}
                          className="h-10 text-sm data-[active=true]:font-semibold"
                        >
                          {locked ? (
                            <span onClick={() => toast.info("Conclua a configuração inicial da empresa para acessar este módulo.")}>
                              <item.icon className="size-4.5 shrink-0" aria-hidden />
                              <span className="truncate">{item.label}</span>
                            </span>
                          ) : (
                            <Link to={item.to} onClick={closeOnMobile} className="gap-3">
                              <item.icon className="size-4.5 shrink-0" aria-hidden />
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
              {theme === "dark" ? <Sun className="size-4.5 shrink-0" aria-hidden /> : <Moon className="size-4.5 shrink-0" aria-hidden />}
              <span className="truncate">{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSignOut} tooltip="Sair da conta" className="h-10 gap-3 text-sm">
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
                <span className="truncate">{membership?.organizations?.trade_name ?? "Configurando…"}</span>
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
