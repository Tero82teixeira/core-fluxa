import { HELP_ARTICLES } from "./help-center.ts";
import { PRODUCT_UPDATES } from "./product-updates.ts";

export const GLOBAL_SEARCH_LIMIT = 25;
export const GLOBAL_SEARCH_MODULE_LIMIT = 5;

export type GlobalSearchType =
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
  return results
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
    })
    .slice(0, globalLimit)
    .map(({ result }) => result);
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
