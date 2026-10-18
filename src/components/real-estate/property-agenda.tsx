import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/workspace";
import { useRealEstateMobile } from "@/hooks/use-real-estate-mobile";
import { mobileDay, type MobileToday } from "@/lib/real-estate-mobile";
function dateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function PropertyAgendaRows({ items }: { items: MobileToday[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <article key={`${item.kind}:${item.id}`} className="space-y-2 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            {item.kind === "visit" ? "Visita" : "Retorno"} ·{" "}
            {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
              new Date(item.at),
            )}
          </p>
          <p className="break-words font-semibold">{item.title}</p>
          {item.client_id ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/clientes/$clientId" params={{ clientId: item.client_id }}>
                Ver cliente
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/imobiliaria/imoveis" search={{ secao: "atendimentos" }}>
                Ver atendimento
              </Link>
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}
export function PropertyAgenda({ compact = false }: { compact?: boolean }) {
  const { organizationId } = useWorkspace();
  const source = useRealEstateMobile(organizationId);
  const [date, setDate] = useState(dateKey);
  const [page, setPage] = useState(1);
  const currentDate = compact ? dateKey() : date;
  const day = mobileDay(new Date(`${currentDate}T12:00:00`));
  const query = useQuery({
    queryKey: ["real-estate-agenda", source.scope, day.start, page],
    queryFn: () => source.today(day.start, day.end, page),
    refetchInterval: 60_000,
  });
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {compact ? "Sua agenda de hoje" : "Visitas e retornos"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Compromissos atribuídos a você, no horário deste aparelho.
          </p>
        </div>
        {compact ? (
          <Button asChild variant="outline">
            <Link to="/imobiliaria/imoveis" search={{ secao: "agenda" }}>
              Ver agenda
            </Link>
          </Button>
        ) : (
          <label className="text-sm">
            Dia
            <Input
              aria-label="Dia da agenda"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={date}
              onChange={(event) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) {
                  setDate(event.target.value);
                  setPage(1);
                }
              }}
              className="min-h-11 text-base"
            />
          </label>
        )}
      </div>
      {query.isLoading ? (
        <p role="status">Carregando agenda…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>Não foi possível carregar a agenda.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {!query.data?.items.length && (
            <p className="text-sm text-muted-foreground">
              Nenhuma visita ou retorno seu agendado para este dia.
            </p>
          )}
          <PropertyAgendaRows
            items={compact ? (query.data?.items ?? []).slice(0, 5) : (query.data?.items ?? [])}
          />
          {compact && (query.data?.total ?? 0) > 5 && (
            <p className="text-sm text-muted-foreground">
              Mostrando 5 de {query.data?.total} compromissos. Abra a agenda para ver os demais.
            </p>
          )}
          {!compact && (query.data?.total ?? 0) > 20 && (
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span>
                {page} / {Math.ceil((query.data?.total ?? 0) / 20)}
              </span>
              <Button
                variant="outline"
                disabled={page * 20 >= (query.data?.total ?? 0)}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
