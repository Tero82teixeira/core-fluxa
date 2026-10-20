import "@/i18n";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  CONSULTING_TEMPLATE_IDS,
  consultingTemplate,
  type ConsultingTemplateId,
  type ConsultingTemplateDraft,
} from "@/lib/consulting-templates";

export function ConsultingTemplatePicker({
  onApply,
  hasContent = false,
  disabled = false,
}: {
  onApply: (draft: ConsultingTemplateDraft) => void;
  hasContent?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation(),
    id = useId();
  const [selected, setSelected] = useState<ConsultingTemplateId>("advisory"),
    [replace, setReplace] = useState(false);
  const draft = consultingTemplate(selected, t);
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border bg-muted/20 p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">{t("consultingTemplates.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("consultingTemplates.hint")}</p>
      </div>
      <label className="grid gap-2 text-sm" htmlFor={`${id}-model`}>
        {t("consultingTemplates.choose")}
        <select
          id={`${id}-model`}
          disabled={disabled}
          className="min-h-11 min-w-0 w-full rounded-lg border bg-background px-3"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value as ConsultingTemplateId);
            setReplace(false);
          }}
        >
          {CONSULTING_TEMPLATE_IDS.map((key) => (
            <option key={key} value={key}>
              {t(`consultingTemplates.models.${key}.name`)}
            </option>
          ))}
        </select>
      </label>
      <div className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
        <h3 className="[overflow-wrap:anywhere] font-medium">{draft.title}</h3>
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm text-muted-foreground">
          {draft.description}
        </p>
        <p className="text-sm">{t("consultingTemplates.initialStage")}</p>
        <ol className="list-inside list-decimal space-y-2 text-sm">
          {draft.deliveries.map((title) => (
            <li key={title} className="[overflow-wrap:anywhere]">
              {title}
            </li>
          ))}
        </ol>
      </div>
      {hasContent && (
        <label className="flex min-h-11 items-start gap-3 text-sm" htmlFor={`${id}-replace`}>
          <input
            id={`${id}-replace`}
            type="checkbox"
            className="mt-1 size-5 shrink-0"
            checked={replace}
            disabled={disabled}
            onChange={(e) => setReplace(e.target.checked)}
          />
          {t("consultingTemplates.replace")}
        </label>
      )}
      <Button
        type="button"
        className="min-h-11 w-full sm:w-auto"
        disabled={disabled || (hasContent && !replace)}
        onClick={() => {
          onApply(draft);
          setReplace(false);
        }}
      >
        {t("consultingTemplates.apply")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("consultingTemplates.noAutomation")}</p>
    </section>
  );
}
