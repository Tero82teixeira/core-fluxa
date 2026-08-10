import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileStack, Gauge, HelpCircle, ListChecks, Loader2, MessagesSquare, Search, Sparkles, Users, Wallet, Files } from "lucide-react";

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useGlobalSearch } from "@/hooks/use-operations";
import { searchLocalSources, rankGlobalSearchResults, type GlobalSearchResult, type GlobalSearchType } from "@/lib/global-search";
import { useWorkspace } from "@/lib/workspace";

const GROUPS: GlobalSearchType[] = ["Cliente", "Processo", "Tarefa", "Documento", "Comunicação", "Financeiro", "Monitoramento", "Ajuda", "Novidade"];
const LABELS: Record<GlobalSearchType, string> = { Cliente: "Clientes", Processo: "Processos", Tarefa: "Tarefas", Documento: "Documentos", Comunicação: "Comunicação", Financeiro: "Financeiro", Monitoramento: "Monitoramento", Ajuda: "Ajuda", Novidade: "Novidades" };
const ICONS = { Cliente: Users, Processo: FileStack, Tarefa: ListChecks, Documento: Files, Comunicação: MessagesSquare, Financeiro: Wallet, Monitoramento: Gauge, Ajuda: HelpCircle, Novidade: Sparkles } satisfies Record<GlobalSearchType, typeof Search>;

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { organizationId, can } = useWorkspace();
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTerm(term.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [term]);
  useEffect(() => { if (!open) { setTerm(""); setDebouncedTerm(""); } }, [open]);

  const access = useMemo(() => ({ clients: can("clients.view"), processes: can("processes.view"), finance: can("finance.view") }), [can]);
  const remote = useGlobalSearch(organizationId, debouncedTerm, access);
  const results = useMemo(() => rankGlobalSearchResults([...(term ? searchLocalSources(term) : []), ...(remote.data ?? [])], term), [term, remote.data]);
  const loading = term.trim().length >= 2 && (term.trim() !== debouncedTerm || remote.isFetching);

  const select = (result: GlobalSearchResult) => {
    onOpenChange(false);
    void navigate({ to: result.route });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput autoFocus aria-label="Buscar em tudo" placeholder="Buscar clientes, processos, tarefas e muito mais…" value={term} onValueChange={setTerm} />
      <CommandList className="max-h-[min(70dvh,32rem)]">
        {!term.trim() && <div className="px-6 py-10 text-center text-sm text-muted-foreground">Busque clientes, processos, tarefas e muito mais.</div>}
        {loading && <div role="status" className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Buscando…</div>}
        {term.trim() && !loading && <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>}
        {GROUPS.map((type) => {
          const items = results.filter((item) => item.type === type);
          if (!items.length) return null;
          const Icon = ICONS[type];
          return <CommandGroup key={type} heading={LABELS[type]}>{items.map((item) => (
            <CommandItem key={`${item.type}:${item.id}`} value={`${item.type} ${item.title} ${item.subtitle ?? ""}`} onSelect={() => select(item)} className="min-h-12">
              <Icon aria-hidden className="size-4" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.title}</span>{item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}</span>
            </CommandItem>
          ))}</CommandGroup>;
        })}
      </CommandList>
    </CommandDialog>
  );
}
