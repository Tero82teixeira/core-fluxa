import { SETTLEMENT_STATUSES, type SettlementRow } from "./real-estate-settlements.ts";

export type SettlementTotals = {
  commission_received: number;
  owner_pending: number;
  owner_paid: number;
};
export type SettlementPage = { items: SettlementRow[]; total: number; totals: SettlementTotals };

export function realEstateFinancialSummary(totals: SettlementTotals) {
  const commission = Math.round(Number(totals.commission_received) * 100);
  const pending = Math.round(Number(totals.owner_pending) * 100);
  const paid = Math.round(Number(totals.owner_paid) * 100);
  return {
    gross_received: (commission + pending + paid) / 100,
    commission_received: commission / 100,
    owner_pending: pending / 100,
    owner_paid: paid / 100,
  };
}

const EXPORT_LIMIT = 10_000;
const changed = () => new Error("Os demonstrativos mudaram durante a exportação. Tente novamente.");
const checkAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error("EXPORT_ABORTED");
};

export async function collectSettlementExport(
  loadPage: (page: number) => Promise<SettlementPage>,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<SettlementRow[]> {
  const rows: SettlementRow[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  for (let page = 1; ; page++) {
    checkAbort(signal);
    const result = await loadPage(page);
    checkAbort(signal);
    if (!Number.isSafeInteger(result.total) || result.total < 0) throw changed();
    if (result.total > EXPORT_LIMIT)
      throw new Error(
        "A exportação aceita até 10.000 demonstrativos. Filtre por situação ou abra um imóvel para reduzir a lista.",
      );
    if (total !== undefined && result.total !== total) throw changed();
    total = result.total;
    if (result.items.length !== Math.min(20, total - rows.length)) throw changed();
    for (const row of result.items) {
      if (!row.id || ids.has(row.id)) throw changed();
      ids.add(row.id);
      rows.push(row);
    }
    onProgress?.(rows.length, total);
    if (rows.length === total) return rows;
  }
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Aspas de CSV não impedem que Excel/Sheets interpretem fórmulas.
  const safe = /^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
const decimal = (value: number) => Number(value).toFixed(2).replace(".", ",");
const date = (value: string | null) => (value ? value.split("-").reverse().join("/") : "");

export function settlementCsv(rows: readonly SettlementRow[]): string {
  const header = [
    "ID do demonstrativo",
    "Imóvel",
    "Contrato",
    "Proprietário",
    "Competência / referência",
    "Situação",
    "Bruto (R$)",
    "Tipo de comissão",
    "Percentual ou valor fixo",
    "Comissão (R$)",
    "Valor do proprietário (R$)",
    "Previsão do repasse",
    "Data da última operação",
    "Observação da última operação",
    "Versão",
  ];
  const values = rows.map((row) => [
    row.id,
    row.property_code,
    row.contract_reference,
    row.owner_name,
    row.reference,
    SETTLEMENT_STATUSES[row.display_status],
    decimal(row.gross),
    row.commission_type === "percentual" ? "Percentual (%)" : "Valor fixo (R$)",
    decimal(row.commission_value),
    decimal(row.commission_amount),
    decimal(row.owner_amount),
    date(row.due_on),
    date(row.occurred_on),
    row.note,
    row.version,
  ]);
  return "\uFEFF" + [header, ...values].map((row) => row.map(csvCell).join(";")).join("\r\n");
}
