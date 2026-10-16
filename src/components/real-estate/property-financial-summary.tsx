import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWorkspace } from "@/lib/workspace";
import { useSettlements } from "@/hooks/use-real-estate-settlements";
import { realEstateFinancialSummary } from "@/lib/real-estate-finance";
import { formatCurrency } from "@/lib/format";

export function PropertyFinancialSummary({ onOpen }: { onOpen: () => void }) {
  const { organizationId } = useWorkspace();
  const query = useSettlements(organizationId, null, "", 1);
  const summary = query.data ? realEstateFinancialSummary(query.data.totals) : null;
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Resumo financeiro da imobiliária</h2>
            <p className="text-sm text-muted-foreground">
              Valores acumulados de toda a empresa, sem filtro de período.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Atualizar resumo
            </Button>
            <Button variant="outline" onClick={onOpen}>
              Ver demonstrativos
            </Button>
          </div>
        </div>
        {query.isError ? (
          <p role="alert">
            Não foi possível carregar o resumo. Use “Atualizar resumo” para tentar novamente.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={query.isFetching}>
            {(
              [
                ["Bruto recebido", "gross_received"],
                ["Comissão recebida", "commission_received"],
                ["Repasse pendente", "owner_pending"],
                ["Repasse confirmado", "owner_paid"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <strong className="mt-1 block text-xl">
                  {query.isPending || !summary ? "—" : formatCurrency(summary[key])}
                </strong>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          O bruto recebido inclui a comissão e a parte do proprietário, pendente ou já repassada.
          Demonstrativos previstos e cancelados ficam fora desses valores. As confirmações registram
          operações já realizadas.
        </p>
        {query.isSuccess && query.data.total === 0 && (
          <p className="text-sm">
            Ainda não há demonstrativos. Depois de registrar um contrato, abra “Ver demonstrativos”
            para começar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
