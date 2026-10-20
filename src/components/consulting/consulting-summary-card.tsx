import "@/i18n";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildConsultingSummary,
  consultingSummaryDocument,
  type ConsultingSummaryInput,
} from "@/lib/consulting-summary";

export function ConsultingSummaryCard({
  input,
  formatDate,
}: {
  input: ConsultingSummaryInput;
  formatDate: (value: string) => string;
}) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const summary = buildConsultingSummary(input);
  const content = consultingSummaryDocument(summary, t, formatDate);
  return (
    <details className="min-w-0 rounded-2xl border bg-card p-4 sm:p-6">
      <summary className="min-h-11 cursor-pointer content-center break-words rounded-md text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring">
        {t("consultingSummary.open")}
      </summary>
      <div className="mt-4 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <h2 className="text-lg font-semibold">{content.title}</h2>
            <p className="text-sm text-muted-foreground">{content.reference}</p>
            <p className="text-sm text-muted-foreground">{content.notice}</p>
          </div>
          <Button
            className="min-h-11 w-full sm:w-auto"
            disabled={downloading}
            onClick={async () => {
              if (downloading) return;
              setDownloading(true);
              try {
                const { downloadConsultingSummary } =
                  await import("@/lib/consulting-summary-download");
                await downloadConsultingSummary(content, summary.code, summary.today);
              } catch {
                toast.error(t("consultingSummary.downloadError"));
              } finally {
                setDownloading(false);
              }
            }}
          >
            {t(downloading ? "consultingSummary.downloading" : "consultingSummary.download")}
          </Button>
        </div>
        <div className="space-y-2 rounded-xl bg-muted/50 p-4">
          <p className="text-sm font-medium">{content.progress}</p>
          <p className="text-xs text-muted-foreground">{content.statusHint}</p>
        </div>
        {content.sections.map((section) => (
          <section key={section.title} className="min-w-0 space-y-3">
            <h3 className="font-semibold">{section.title}</h3>
            <ul className="space-y-3">
              {section.lines.map((line, index) => (
                <li
                  key={index}
                  className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed"
                >
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
