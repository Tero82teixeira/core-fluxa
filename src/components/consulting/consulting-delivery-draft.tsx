import "@/i18n";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { consultingDraftDeliveriesValid } from "@/lib/consulting-templates";

export function ConsultingDeliveryDraft({
  titles,
  onChange,
  disabled = false,
}: {
  titles: string[];
  onChange: (titles: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation(),
    id = useId();
  const valid = consultingDraftDeliveriesValid(titles);
  return (
    <section className="min-w-0 space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t("consultingTemplates.deliveries")}</h2>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={disabled || titles.length >= 20}
          onClick={() => onChange([...titles, ""])}
        >
          {t("consultingTemplates.add")}
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t("consultingTemplates.deliveryHint")}
      </p>
      <ol className="space-y-3">
        {titles.map((title, index) => (
          <li key={index} className="min-w-0 space-y-2 rounded-lg bg-muted/30 p-3">
            <label htmlFor={`${id}-${index}`} className="text-sm">
              {t("consultingTemplates.deliveryNumber", { number: index + 1 })}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`${id}-${index}`}
                className="min-h-11 min-w-0 flex-1 basis-40"
                maxLength={160}
                required
                value={title}
                disabled={disabled}
                aria-describedby={`${id}-hint`}
                aria-invalid={!valid}
                onChange={(e) =>
                  onChange(titles.map((value, i) => (i === index ? e.target.value : value)))
                }
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={disabled}
                aria-label={t("consultingTemplates.removeNumber", { number: index + 1 })}
                onClick={() => onChange(titles.filter((_, i) => i !== index))}
              >
                {t("consultingTemplates.remove")}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {!titles.length && (
        <p className="text-sm text-muted-foreground">{t("consultingTemplates.empty")}</p>
      )}
      {!valid && (
        <p role="status" className="text-sm text-destructive">
          {t("consultingTemplates.invalidDeliveries")}
        </p>
      )}
    </section>
  );
}
