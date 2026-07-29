import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronsLeft,
  LifeBuoy,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";

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
import { NAV_ITEMS } from "@/lib/navigation";
import { initials } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace";
import { ROLE } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function AppSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggleTheme } = useTheme();
  const { displayName, role, membership } = useWorkspace();

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 py-4">
        <Link to="/central" onClick={closeOnMobile} className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4" aria-hidden />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-semibold tracking-tight">FLUXA</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {membership?.organizations?.trade_name ?? "Central de processos"}
              </span>
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Operação</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link to={item.to} onClick={closeOnMobile} className="gap-3">
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                        {!item.ready && !collapsed && (
                          <span className="ml-auto rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
                            em breve
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t border-sidebar-border px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Ajuda e suporte">
              <Link to="/ajuda" onClick={closeOnMobile} className="gap-3">
                <LifeBuoy className="size-4 shrink-0" aria-hidden />
                <span className="truncate">Ajuda e suporte</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Novidades">
              <Link to="/novidades" onClick={closeOnMobile} className="gap-3">
                <Sparkles className="size-4 shrink-0" aria-hidden />
                <span className="truncate">Novidades</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleTheme} tooltip="Alternar tema" className="gap-3">
              {theme === "dark" ? <Sun className="size-4 shrink-0" aria-hidden /> : <Moon className="size-4 shrink-0" aria-hidden />}
              <span className="truncate">{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSignOut} tooltip="Sair da conta" className="gap-3">
              <LogOut className="size-4 shrink-0" aria-hidden />
              <span className="truncate">Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className={cn("mt-2 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-2", collapsed && "justify-center border-0 bg-transparent p-0")}>
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{role ? ROLE[role].label : "Sem perfil"}</p>
            </div>
          )}
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="Recolher menu"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                >
                  <ChevronsLeft className="size-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Recolher menu</TooltipContent>
            </Tooltip>
          )}
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Expandir menu"
            className="mx-auto grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <UserRound className="size-4" aria-hidden />
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
