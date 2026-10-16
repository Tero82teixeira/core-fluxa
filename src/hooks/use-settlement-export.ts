import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchSettlementPage } from "@/hooks/use-real-estate-settlements";
import { collectSettlementExport, settlementCsv } from "@/lib/real-estate-finance";
import { downloadBlob } from "@/lib/data-protection";
import { proposalToday } from "@/lib/real-estate-proposals";
import type { SettlementRow } from "@/lib/real-estate-settlements";

export function useSettlementExport(org: string | null, property: string | null, status: string) {
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  useEffect(() => () => active.current?.abort(), [org, property, status]);

  async function exportRows(row?: SettlementRow) {
    if (!org || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setProgress("Preparando exportação…");
    try {
      const rows = row
        ? [row]
        : await collectSettlementExport(
            (page) => fetchSettlementPage(org, property, status, page),
            controller.signal,
            (loaded, total) => setProgress(`${loaded} de ${total} demonstrativo(s)`),
          );
      if (controller.signal.aborted) return;
      if (!rows.length) {
        toast.info("Nenhum demonstrativo neste filtro para exportar.");
        return;
      }
      const scope = row ? row.id : property || "empresa";
      downloadBlob(
        new Blob([settlementCsv(rows)], { type: "text/csv;charset=utf-8" }),
        `fluxa-demonstrativos-${org.slice(0, 8)}-${scope}-${proposalToday()}.csv`,
      );
      toast.success(`${rows.length} demonstrativo(s) exportado(s).`);
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(
        error instanceof Error && !("code" in error)
          ? error.message
          : "Não foi possível exportar os demonstrativos. Tente novamente.",
      );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
        setProgress("");
      }
    }
  }
  return { busy, progress, exportRows };
}
