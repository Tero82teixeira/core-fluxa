import "@/i18n";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CONSULTING_FOCUSES,
  CONSULTING_PRIORITIES,
  consultingDiagnosticValid,
  emptyConsultingDiagnostic,
  type ConsultingDiagnosticValues,
} from "@/lib/consulting-diagnostic";

type Props = {
  values: ConsultingDiagnosticValues | null;
  canEdit: boolean;
  onSave: (values: ConsultingDiagnosticValues) => Promise<void>;
  formatDate: (value: string) => string;
};
export function ConsultingDiagnosticForm({
  values,
  onSave,
  onCancel,
}: Pick<Props, "onSave"> & { values: ConsultingDiagnosticValues; onCancel: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [form, setForm] = useState(values);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  // Preserve the revision captured when editing began, including during refetches.
  const save = useRef(onSave);
  const selectClass = "min-h-11 w-full rounded-md border bg-background px-3 text-sm";
  const valid = consultingDiagnosticValid(form);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (locked.current || !valid) return;
        locked.current = true;
        setSaving(true);
        setError("");
        try {
          await save.current(form);
          toast.success(t("consultingDiagnostic.saved"));
        } catch (cause) {
          const stale =
            typeof cause === "object" &&
            cause !== null &&
            "message" in cause &&
            String(cause.message).includes("CONSULTING_DIAGNOSTIC_STALE");
          setError(t(stale ? "consultingDiagnostic.stale" : "consultingDiagnostic.saveError"));
        } finally {
          locked.current = false;
          setSaving(false);
        }
      }}
    >
      <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label htmlFor={`${id}-focus`} className="grid gap-2 text-sm">
          {t("consultingDiagnostic.focus")}
          <select
            id={`${id}-focus`}
            className={selectClass}
            value={form.focus}
            onChange={(e) =>
              setForm({ ...form, focus: e.target.value as ConsultingDiagnosticValues["focus"] })
            }
          >
            {CONSULTING_FOCUSES.map((key) => (
              <option key={key} value={key}>
                {t(`consultingDiagnostic.focuses.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-priority`} className="grid gap-2 text-sm">
          {t("consultingDiagnostic.priority")}
          <select
            id={`${id}-priority`}
            className={selectClass}
            value={form.priority}
            onChange={(e) =>
              setForm({
                ...form,
                priority: e.target.value as ConsultingDiagnosticValues["priority"],
              })
            }
          >
            {CONSULTING_PRIORITIES.map((key) => (
              <option key={key} value={key}>
                {t(`consultingDiagnostic.priorities.${key}`)}
              </option>
            ))}
          </select>
        </label>
        {(["situation", "attempts", "expected_result"] as const).map((key) => (
          <label
            key={key}
            htmlFor={`${id}-${key}`}
            className="grid min-w-0 gap-2 text-sm sm:col-span-2"
          >
            {t(`consultingDiagnostic.${key}`)}
            <Textarea
              id={`${id}-${key}`}
              value={form[key]}
              rows={3}
              maxLength={2000}
              required={key !== "attempts"}
              minLength={key !== "attempts" ? 3 : undefined}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <label htmlFor={`${id}-target`} className="grid gap-2 text-sm">
          {t("consultingDiagnostic.target_on")}
          <Input
            className="min-h-11"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            id={`${id}-target`}
            value={form.target_on}
            onChange={(e) => setForm({ ...form, target_on: e.target.value })}
          />
        </label>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          {t("consultingDiagnostic.requiredHint")}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button className="min-h-11" type="submit" disabled={saving || !valid}>
            {t(saving ? "consultingDiagnostic.saving" : "consultingDiagnostic.save")}
          </Button>
          <Button className="min-h-11" type="button" variant="outline" onClick={onCancel}>
            {t("consultingDiagnostic.cancel")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
export function ConsultingDiagnosticCard({ values, canEdit, onSave, formatDate }: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("consultingDiagnostic.title")}</h2>
        {canEdit && !editing && (
          <Button className="min-h-11" variant="outline" onClick={() => setEditing(true)}>
            {t(values ? "consultingDiagnostic.edit" : "consultingDiagnostic.add")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("consultingDiagnostic.hint")}</p>
      {editing && canEdit ? (
        <ConsultingDiagnosticForm
          values={values ?? emptyConsultingDiagnostic()}
          onCancel={() => setEditing(false)}
          onSave={async (draft) => {
            await onSave(draft);
            setEditing(false);
          }}
        />
      ) : values ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["focus", t(`consultingDiagnostic.focuses.${values.focus}`)],
              ["priority", t(`consultingDiagnostic.priorities.${values.priority}`)],
              ["situation", values.situation],
              ["attempts", values.attempts],
              ["expected_result", values.expected_result],
              ["target_on", values.target_on ? formatDate(values.target_on) : ""],
            ] as const
          ).map(([key, value]) => (
            <div
              key={key}
              className={`min-w-0 ${["situation", "attempts", "expected_result"].includes(key) ? "sm:col-span-2" : ""}`}
            >
              <dt className="text-sm text-muted-foreground">{t(`consultingDiagnostic.${key}`)}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                {value || t("consultingDiagnostic.emptyField")}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t("consultingDiagnostic.empty")}</p>
      )}
    </section>
  );
}
