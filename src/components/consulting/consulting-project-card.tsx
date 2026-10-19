import "@/i18n";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { consultingProjectValid, type ConsultingProjectValues } from "@/lib/consulting-project";

export function ConsultingProjectCard({
  values,
  canEdit,
  onSave,
  formatDate,
}: {
  values: ConsultingProjectValues;
  canEdit: boolean;
  onSave: (values: ConsultingProjectValues) => Promise<void>;
  formatDate: (value: string) => string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [form, setForm] = useState(values),
    [editing, setEditing] = useState(false),
    [saving, setSaving] = useState(false);
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("consultingProject.title")}</h2>
        {canEdit && !editing && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setForm(values);
              setEditing(true);
            }}
          >
            {t("consultingProject.edit")}
          </Button>
        )}
      </div>
      {editing && canEdit ? (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canEdit || saving || !consultingProjectValid(form)) return;
            setSaving(true);
            try {
              await onSave(form);
              setEditing(false);
              toast.success(t("consultingProject.saved"));
            } catch {
              toast.error(t("consultingProject.saveError"));
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="grid gap-2 text-sm sm:col-span-2" htmlFor={`${id}-title`}>
            {t("consultingProject.objective")}
            <Input
              id={`${id}-title`}
              required
              minLength={3}
              maxLength={160}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm sm:col-span-2" htmlFor={`${id}-scope`}>
            {t("consultingProject.scope")}
            <Textarea
              id={`${id}-scope`}
              rows={5}
              maxLength={4000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm" htmlFor={`${id}-owner`}>
            {t("consultingProject.owner")}
            <Input
              id={`${id}-owner`}
              maxLength={120}
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm" htmlFor={`${id}-due`}>
            {t("consultingProject.due")}
            <Input
              id={`${id}-due`}
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              className="min-h-11"
              type="submit"
              disabled={saving || !consultingProjectValid(form)}
            >
              {t(saving ? "consultingProject.saving" : "consultingProject.save")}
            </Button>
            <Button
              className="min-h-11"
              variant="outline"
              type="button"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              {t("consultingProject.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["objective", values.title],
              ["scope", values.description],
              ["owner", values.owner_name],
              ["due", values.due_date ? formatDate(values.due_date) : ""],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className={
                ["objective", "scope"].includes(label) ? "min-w-0 sm:col-span-2" : "min-w-0"
              }
            >
              <dt className="text-sm text-muted-foreground">{t(`consultingProject.${label}`)}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                {value || t("consultingProject.empty")}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
