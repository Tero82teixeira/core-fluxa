import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/lib/workspace";
import { formatCurrency } from "@/lib/format";
import { PROPOSAL_STATUSES, proposalDate } from "@/lib/real-estate-proposals";
import { CONTRACT_STATUSES } from "@/lib/real-estate-contracts";
import { SETTLEMENT_STATUSES } from "@/lib/real-estate-settlements";
import { useRealEstateOverview, type OverviewItem } from "@/hooks/use-real-estate-overview";
import type { RealEstateAlertSearch } from "@/lib/real-estate-notifications";
const labels = { imovel: "Imóvel", proposta: "Proposta", contrato: "Contrato", repasse: "Repasse" };
const cards = {
  proposta: "Propostas aguardando decisão",
  contrato: "Contratos vencidos ou vencendo em até 30 dias",
  repasse: "Repasses atrasados",
} as const;
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
export function PropertyOverview({
  onOpen,
  alertSearch,
}: {
  onOpen: (item: OverviewItem) => void;
  alertSearch?: RealEstateAlertSearch;
}) {
  const { organizationId } = useWorkspace();
  const [text, setText] = useState("");
  const [filters, setFilters] = useState({ search: "", kind: "", scope: "pendencias", page: 1 });
  useEffect(() => {
    if (!alertSearch?.pendencia) return;
    setText(alertSearch.busca || "");
    setFilters({
      search: alertSearch.busca || "",
      kind: alertSearch.pendencia,
      scope: "pendencias",
      page: 1,
    });
  }, [alertSearch?.pendencia, alertSearch?.busca]);
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((f) => ({ ...f, search: text.trim(), page: 1 })),
      300,
    );
    return () => clearTimeout(timer);
  }, [text]);
  const query = useRealEstateOverview(
    organizationId,
    filters.search,
    filters.kind,
    filters.scope,
    filters.page,
  );
  const count = query.data?.total || 0;
  function clear() {
    setText("");
    setFilters({ search: "", kind: "", scope: "pendencias", page: 1 });
  }
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Visão geral da imobiliária</h2>
            <p className="text-sm text-muted-foreground">
              Encontre um registro ou abra uma pendência para continuar o atendimento.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Atualizar painel
          </Button>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {Object.entries(cards).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              aria-pressed={filters.kind === kind && filters.scope === "pendencias"}
              className="rounded-xl border p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setText("");
                setFilters({ search: "", kind, scope: "pendencias", page: 1 });
              }}
            >
              <span className="block text-sm">{label}</span>
              <strong className="mt-1 block text-2xl">
                {query.isPending || query.isError
                  ? "—"
                  : (query.data?.counts[kind as keyof typeof cards] ?? 0)}
              </strong>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Os totais acima consideram toda a empresa. Propostas com validade vencida continuam
          pendentes até uma decisão. Datas no horário de Brasília.
        </p>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 lg:col-span-2">
            <Label htmlFor="overview-search">Buscar por imóvel, cliente ou contrato</Label>
            <div className="relative">
              <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                id="overview-search"
                className="pl-9"
                maxLength={120}
                placeholder="IMOV-002, nome do cliente ou CT-001"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setFilters((f) => ({ ...f, scope: "todos", page: 1 }));
                }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="overview-kind">Tipo de registro</Label>
            <select
              id="overview-kind"
              className={selectClass}
              value={filters.kind}
              onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value, page: 1 }))}
            >
              <option value="">Todos os tipos</option>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="overview-scope">Exibir</Label>
            <select
              id="overview-scope"
              className={selectClass}
              value={filters.scope}
              onChange={(e) => setFilters((f) => ({ ...f, scope: e.target.value, page: 1 }))}
            >
              <option value="pendencias">Somente pendências</option>
              <option value="todos">Todos os registros</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            {query.isFetching
              ? "Buscando registros…"
              : query.isError
                ? "Consulta indisponível."
                : `${count} registro(s) encontrado(s).`}
          </p>
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpar busca e filtros
          </Button>
        </div>
        {query.isError ? (
          <div role="alert" className="rounded-md border p-4">
            <p>Não foi possível carregar a visão geral.</p>
            <Button className="mt-2" variant="outline" onClick={() => void query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : query.isPending ? (
          <p>Carregando visão geral…</p>
        ) : !query.data?.items.length ? (
          <p className="rounded-md border border-dashed p-5">
            Nenhum registro neste filtro. Escolha “Todos os registros” para consultar também os
            concluídos.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {query.data.items.map((item) => (
              <article key={`${item.kind}-${item.id}`} className="space-y-2 rounded-xl border p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {labels[item.kind]} · {item.property.code}
                </p>
                <h3 className="break-words font-semibold">
                  {item.kind === "contrato"
                    ? item.data.reference
                    : item.kind === "repasse"
                      ? `${item.data.contract_reference} · ${item.data.reference}`
                      : item.property.title}
                </h3>
                <p className="text-sm">
                  {item.kind === "imovel"
                    ? item.property.owner_name
                    : item.kind === "repasse"
                      ? item.data.owner_name
                      : item.data.client_name}
                </p>
                {item.kind === "proposta" && (
                  <p className="text-sm">
                    {item.data.display_status === "vencida"
                      ? "Validade vencida · aguardando decisão"
                      : PROPOSAL_STATUSES[item.data.status]}{" "}
                    · {formatCurrency(Number(item.data.amount))}
                  </p>
                )}
                {item.kind === "contrato" && (
                  <p className="text-sm">
                    {CONTRACT_STATUSES[item.data.display_status]} ·{" "}
                    {formatCurrency(Number(item.data.amount))}
                  </p>
                )}
                {item.kind === "repasse" && (
                  <p className="text-sm">
                    {SETTLEMENT_STATUSES[item.data.display_status]} · Proprietário:{" "}
                    {formatCurrency(Number(item.data.owner_amount))}
                  </p>
                )}
                {item.due_on && (
                  <p className="text-xs text-muted-foreground">
                    {item.kind === "proposta"
                      ? "Validade"
                      : item.kind === "contrato"
                        ? "Término"
                        : "Previsão do repasse"}
                    : {proposalDate(item.due_on)}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Abrir ${labels[item.kind].toLowerCase()} ${item.kind === "contrato" ? item.data.reference : item.property.code}`}
                  onClick={() => onOpen(item)}
                >
                  Abrir {labels[item.kind].toLowerCase()}
                </Button>
              </article>
            ))}
          </div>
        )}
        {!query.isError && count > 20 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              Página {filters.page} de {Math.ceil(count / 20)}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={filters.page === 1 || query.isFetching}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={filters.page * 20 >= count || query.isFetching}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
