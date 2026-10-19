import { formatCnjNumber, legalCnjSearch } from "./legal-search.ts";
import type { GlobalSearchResult } from "./global-search.ts";
type LegalSearchRow = {
  id: string;
  code: string;
  title: string | null;
  cnj_number: string;
  updated_at?: string;
  clients?: { name: string } | null;
};
type Rpc = {
  rpc: (
    name: "search_legal_processes",
    args: {
      _organization_id: string;
      _cnj: string;
      _filters: { page: number; pageSize: number; sort: string };
    },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
/** null mantém as fontes gerais; array (inclusive vazio) é o resultado da busca jurídica. */
export async function searchLegalGlobalProcesses(
  client: Rpc,
  organizationId: string | null,
  term: string,
  enabled: boolean,
): Promise<GlobalSearchResult[] | null> {
  const cnj = enabled ? legalCnjSearch(term) : null;
  if (!cnj || !organizationId) return null;
  const { data, error } = await client.rpc("search_legal_processes", {
    _organization_id: organizationId,
    _cnj: cnj,
    _filters: { page: 0, pageSize: 5, sort: "code" },
  });
  if (error) throw error;
  const payload = data as { items: LegalSearchRow[]; total: number };
  const rows: GlobalSearchResult[] = payload.items.map((row) => ({
    id: row.id,
    type: "Processo",
    title: row.title || row.code,
    subtitle: [row.code, formatCnjNumber(row.cnj_number), row.clients?.name]
      .filter(Boolean)
      .join(" · "),
    keywords: [term, cnj, row.cnj_number, formatCnjNumber(row.cnj_number)],
    route: `/processos/${row.id}`,
    priority: 1,
    recentAt: row.updated_at,
  }));
  if (payload.total > 5)
    rows.push({
      id: "legal-cnj-all",
      type: "Navegação",
      title: "Ver todos os processos deste CNJ",
      subtitle: `${payload.total} resultados · abrir lista com filtros e paginação`,
      keywords: [term, cnj],
      route: "/processos",
      search: { cnj },
    });
  return rows;
}
