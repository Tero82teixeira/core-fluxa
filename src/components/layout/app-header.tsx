import { useEffect, useState } from "react";
import { DEMO_MODE } from "@/lib/demo";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building,
  CalendarPlus,
  ChevronDown,
  CreditCard,
  FilePlus2,
  FileStack,
  ListPlus,
  Plus,
  Search,
  UploadCloud,
  UserPlus,
  Users,
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
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { useGlobalSearch, useNotifications } from "@/hooks/use-operations";
import { initials, maskDocument, relativeTime } from "@/lib/format";
import { NAV_ITEMS } from "@/lib/navigation";

export function AppHeader({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { displayName, memberships, membership, switchWorkspace, organizationId } = useWorkspace();
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");

  const current = NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  const isDetail = Boolean(current) && pathname !== current?.to;

  const notifications = useNotifications(organizationId);
  const results = useGlobalSearch(organizationId, term);
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;

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
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="shrink-0" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate font-display text-sm font-semibold sm:text-base">
                {current?.label ?? "FLUXA"}
              </h1>
              {DEMO_MODE && (
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
            className="hidden h-9 w-56 justify-start gap-2 text-muted-foreground lg:flex xl:w-72"
          >
            <Search className="size-4" aria-hidden />
            <span className="truncate text-sm">Buscar em tudo…</span>
            <kbd className="ml-auto rounded border border-border px-1.5 text-[10px]">Ctrl K</kbd>
          </Button>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Busca global" onClick={() => setSearchOpen(true)}>
            <Search className="size-4" aria-hidden />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9 gap-1.5">
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
              <Button variant="ghost" size="icon" className="relative" aria-label="Central de notificações">
                <Bell className="size-4" aria-hidden />
                {unread > 0 && (
                  <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-caution" aria-hidden />
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
                  <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p>
                )}
                {(notifications.data ?? []).map((item) => (
                  <div key={item.id} className="px-4 py-3">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(item.created_at)}</p>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {memberships.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden h-9 gap-1.5 md:flex">
                  <Building className="size-4" aria-hidden />
                  <span className="max-w-32 truncate">
                    {membership?.organizations?.trade_name ?? "Workspace"}
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
                    {item.organizations?.trade_name ?? item.organizations?.legal_name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Menu do usuário">
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
              <DropdownMenuItem onSelect={() => navigate({ to: "/configuracoes" })}>Configurações</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate({ to: "/ajuda" })}>Ajuda e suporte</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSignOut}>Sair da conta</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput
          placeholder="Buscar clientes, CPF/CNPJ, telefone, protocolo, processos…"
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          <CommandEmpty>
            {term.length < 2 ? "Digite ao menos 2 caracteres." : "Nenhum registro encontrado."}
          </CommandEmpty>
          {(results.data?.clients ?? []).length > 0 && (
            <CommandGroup heading="Clientes">
              {results.data!.clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`cliente-${client.id}-${client.name}`}
                  onSelect={() => {
                    setSearchOpen(false);
                    navigate({ to: "/clientes/$clientId", params: { clientId: client.id } });
                  }}
                >
                  <Users className="size-4" aria-hidden />
                  <span className="truncate">{client.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {client.document ? maskDocument(client.document) : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(results.data?.processes ?? []).length > 0 && (
            <CommandGroup heading="Processos">
              {results.data!.processes.map((process) => (
                <CommandItem
                  key={process.id}
                  value={`processo-${process.id}-${process.code}`}
                  onSelect={() => {
                    setSearchOpen(false);
                    navigate({ to: "/processos/$processId", params: { processId: process.id } });
                  }}
                >
                  <FileStack className="size-4" aria-hidden />
                  <span className="truncate">
                    {process.code} — {process.title}
                  </span>
                  {process.protocol && (
                    <span className="ml-auto text-xs text-muted-foreground">{process.protocol}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Navegação">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.to}
                value={`ir-${item.label}`}
                onSelect={() => {
                  setSearchOpen(false);
                  navigate({ to: item.to });
                }}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}

export async function signOutFromApp() {
  await supabase.auth.signOut();
}
