import { HELP_ARTICLES } from "./help-center.ts";
import { PRODUCT_UPDATES } from "./product-updates.ts";

export const GLOBAL_SEARCH_LIMIT = 25;
export const GLOBAL_SEARCH_MODULE_LIMIT = 5;

export type GlobalSearchType =
  | "Navegação"
  | "Cliente"
  | "Processo"
  | "Tarefa"
  | "Documento"
  | "Comunicação"
  | "Financeiro"
  | "Monitoramento"
  | "Ajuda"
  | "Novidade";

export type GlobalSearchResult = {
  id: string;
  type: GlobalSearchType;
  title: string;
  subtitle?: string;
  keywords?: string[];
  route: string;
  priority?: number;
  recentAt?: string | null;
};

export type GlobalSearchAccess = { clients: boolean; processes: boolean; finance: boolean };

type NavigationItem = Omit<GlobalSearchResult, "type" | "id"> & {
  id: string;
  permission?: keyof GlobalSearchAccess;
};

const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: "central", title: "Central de Comando", subtitle: "Navegação", keywords: ["início", "dashboard", "comando"], route: "/central" },
  { id: "clientes", title: "Clientes", subtitle: "Navegação", keywords: ["cliente", "carteira"], route: "/clientes", permission: "clients" },
  { id: "processos", title: "Processos", subtitle: "Navegação", keywords: ["processo", "etapas", "protocolos"], route: "/processos", permission: "processes" },
  { id: "documentos", title: "Documentos", subtitle: "Navegação", keywords: ["documento", "arquivos"], route: "/documentos", permission: "processes" },
  { id: "monitoramento", title: "Monitoramento", subtitle: "Navegação", keywords: ["monitorar", "alertas", "prazos", "vencimentos"], route: "/monitoramento", permission: "processes" },
  { id: "tarefas", title: "Tarefas", subtitle: "Navegação", keywords: ["tarefa", "agenda"], route: "/tarefas", permission: "processes" },
  { id: "comunicacao", title: "Comunicação", subtitle: "Navegação", keywords: ["comunicacao", "mensagens"], route: "/comunicacao", permission: "processes" },
  { id: "financeiro", title: "Financeiro", subtitle: "Navegação", keywords: ["finanças", "receitas", "cobranças"], route: "/financeiro", permission: "finance" },
  { id: "relatorios", title: "Relatórios", subtitle: "Navegação", keywords: ["relatorio", "indicadores"], route: "/relatorios" },
  { id: "equipe", title: "Equipe", subtitle: "Navegação", keywords: ["usuários", "permissões"], route: "/equipe" },
  { id: "automacoes", title: "Automações", subtitle: "Navegação", keywords: ["automacao", "regras"], route: "/automacoes" },
  { id: "configuracoes", title: "Configurações", subtitle: "Navegação", keywords: ["configuração", "preferências", "workspace"], route: "/configuracoes" },
  { id: "ajuda", title: "Ajuda e Suporte", subtitle: "Navegação", keywords: ["ajuda", "suporte", "documentação"], route: "/ajuda" },
  { id: "novidades", title: "Novidades", subtitle: "Navegação", keywords: ["novidade", "melhorias", "lançamentos"], route: "/novidades" },
];

export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function scoreSearchResult(result: GlobalSearchResult, term: string): number {
  const needle = normalizeSearchText(term);
  if (!needle) return 0;
  const title = normalizeSearchText(result.title);
  if (title === needle) return 500;
  if (title.startsWith(needle)) return 400;
  if (title.includes(needle)) return 300;
  if ((result.keywords ?? []).some((word) => normalizeSearchText(word).includes(needle))) return 200;
  if (normalizeSearchText(result.subtitle ?? "").includes(needle)) return 100;
  return 0;
}

export function rankGlobalSearchResults(
  results: readonly GlobalSearchResult[],
  term: string,
  moduleLimit = GLOBAL_SEARCH_MODULE_LIMIT,
  globalLimit = GLOBAL_SEARCH_LIMIT,
): GlobalSearchResult[] {
  const seen = new Set<string>();
  const perType = new Map<GlobalSearchType, number>();
  const ranked = results
    .map((result) => ({ result, score: scoreSearchResult(result, term) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (b.result.priority ?? 0) - (a.result.priority ?? 0) || String(b.result.recentAt ?? "").localeCompare(String(a.result.recentAt ?? "")))
    .filter(({ result }) => {
      const key = `${result.type}:${result.id}`;
      const count = perType.get(result.type) ?? 0;
      if (seen.has(key) || count >= moduleLimit) return false;
      seen.add(key);
      perType.set(result.type, count + 1);
      return true;
    });

  // Reserve primeiro uma vaga para cada grupo relevante. Só então use as
  // demais vagas pelo ranking global, para uma fonte numerosa não ocultar outra.
  const selected = new Set<string>();
  const balanced = ranked.filter(({ result }) => {
    if (selected.has(result.type)) return false;
    selected.add(result.type);
    return true;
  });
  const firstKeys = new Set(balanced.map(({ result }) => `${result.type}:${result.id}`));
  return [...balanced, ...ranked.filter(({ result }) => !firstKeys.has(`${result.type}:${result.id}`))]
    .slice(0, globalLimit)
    .sort((a, b) => b.score - a.score || (b.result.priority ?? 0) - (a.result.priority ?? 0))
    .map(({ result }) => result);
}

export function searchNavigation(term: string, access: GlobalSearchAccess): GlobalSearchResult[] {
  return rankGlobalSearchResults(
    NAVIGATION_ITEMS
      .filter((item) => !item.permission || access[item.permission])
      .map((item) => ({ ...item, type: "Navegação" as const, priority: 1_000 })),
    term,
  );
}

export function searchLocalSources(term: string): GlobalSearchResult[] {
  const help = HELP_ARTICLES.map<GlobalSearchResult>((item) => ({
    id: item.id, type: "Ajuda", title: item.title, subtitle: `${item.category} · ${item.summary}`,
    keywords: item.keywords, route: "/ajuda", priority: 10 - item.order,
  }));
  const updates = PRODUCT_UPDATES.map<GlobalSearchResult>((item) => ({
    id: item.id, type: "Novidade", title: item.title, subtitle: `${item.module} · ${item.summary}`,
    keywords: [...item.keywords, ...item.highlights], route: "/novidades", priority: item.featured ? 1 : 0, recentAt: item.date,
  }));
  return rankGlobalSearchResults([...help, ...updates], term);
}

export function composeGlobalSearchResults(
  term: string,
  access: GlobalSearchAccess,
  remoteResults: readonly GlobalSearchResult[] = [],
): GlobalSearchResult[] {
  return rankGlobalSearchResults([...searchNavigation(term, access), ...searchLocalSources(term), ...remoteResults], term);
}
