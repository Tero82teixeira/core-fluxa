import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { summarizeCommercialRows, type CommercialFilters } from "@/lib/real-estate-commercial";
import { demoCommercialRows, COMMERCIAL_DEMO_NOW } from "@/lib/real-estate-demo-commercial";
import type { DemoInquiry } from "@/lib/real-estate-demo-inquiries";
import { CommercialFilterForm, CommercialPanel } from "./commercial-panel";
export function DemoCommercialPanel({
  rows,
  onQueue,
  filters,
  onFiltersChange,
}: {
  rows: DemoInquiry[];
  filters: CommercialFilters;
  onFiltersChange: (f: CommercialFilters) => void;
  onQueue: (f: CommercialFilters) => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const data = summarizeCommercialRows(demoCommercialRows(rows), filters, COMMERCIAL_DEMO_NOW);
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("realEstateDemo.commercial.demoNote")}</p>
      <CommercialFilterForm
        initial={filters}
        responsibles={[{ id: "demo", name: t("realEstateDemo.manual.demoTeam") }]}
        busy={false}
        onApply={onFiltersChange}
      />
      <CommercialPanel data={data} filters={filters} onQueue={onQueue} />
    </section>
  );
}
