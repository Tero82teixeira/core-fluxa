import "@/i18n";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CONSULTING_DELIVERY_STATUSES,
  consultingDeliveryProgress,
  consultingDeliveryValid,
  type ConsultingDeliveryValues,
  type ConsultingDelivery,
} from "@/lib/consulting-project";
const blank: ConsultingDeliveryValues = {
  title: "",
  description: "",
  assignee_name: "",
  due_date: "",
  status: "pendente",
  required: true,
};
export function ConsultingDeliveriesCard({
  items,
  today,
  canEdit,
  onSave,
  formatDate,
}: {
  items: ConsultingDelivery[];
  today: string;
  canEdit: boolean;
  onSave: (values: ConsultingDeliveryValues, id?: string) => Promise<void>;
  formatDate: (date: string) => string;
}) {
  const { t } = useTranslation(),
    prefix = useId();
  const [form, setForm] = useState(blank),
    [editing, setEditing] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const summary = consultingDeliveryProgress(items, today);
  const editingItem = items.find((item) => item.id === editing);
  const obsolete = editing !== null && editing !== "new" && !editingItem;
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("consultingProject.deliveries")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("consultingProject.progress", summary)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("consultingProject.statusHint")}</p>
        </div>
        {canEdit && editing === null && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setForm({ ...blank });
              setEditing("new");
            }}
          >
            {t("consultingProject.add")}
          </Button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={t("consultingProject.deliveries")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.percent}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${summary.percent}%` }} />
      </div>
      {editing !== null && canEdit && (
        <form
          className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving || obsolete || !consultingDeliveryValid(form)) return;
            setSaving(true);
            try {
              await onSave(form, editing === "new" ? undefined : editing);
              setEditing(null);
              toast.success(t("consultingProject.saved"));
            } catch {
              toast.error(t("consultingProject.saveError"));
            } finally {
              setSaving(false);
            }
          }}
        >
          <h3 className="font-medium sm:col-span-2">
            {t(editing === "new" ? "consultingProject.add" : "consultingProject.editDelivery")}
          </h3>
          <label className="grid gap-2 text-sm sm:col-span-2" htmlFor={`${prefix}-title`}>
            {t("consultingProject.deliveryTitle")}
            <Input
              id={`${prefix}-title`}
              required
              minLength={3}
              maxLength={160}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm sm:col-span-2" htmlFor={`${prefix}-description`}>
            {t("consultingProject.details")}
            <Textarea
              id={`${prefix}-description`}
              rows={3}
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm" htmlFor={`${prefix}-owner`}>
            {t("consultingProject.owner")}
            <Input
              id={`${prefix}-owner`}
              maxLength={120}
              value={form.assignee_name}
              onChange={(e) => setForm({ ...form, assignee_name: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm" htmlFor={`${prefix}-due`}>
            {t("consultingProject.due")}
            <Input
              id={`${prefix}-due`}
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm" htmlFor={`${prefix}-status`}>
            {t("consultingProject.status")}
            <select
              id={`${prefix}-status`}
              className="min-h-11 rounded-lg border bg-background px-3"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as ConsultingDeliveryValues["status"] })
              }
            >
              {CONSULTING_DELIVERY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`consultingProject.statuses.${status}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
            />
            {t("consultingProject.required")}
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              className="min-h-11"
              type="submit"
              disabled={saving || obsolete || !consultingDeliveryValid(form)}
            >
              {t(saving ? "consultingProject.saving" : "consultingProject.save")}
            </Button>
            <Button
              className="min-h-11"
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              {t("consultingProject.cancel")}
            </Button>
          </div>
        </form>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="space-y-2 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="min-w-0 break-words font-medium">{item.title}</h3>
              <span className="rounded-full bg-muted px-3 py-1 text-xs">
                {t(`consultingProject.statuses.${item.status}`)}
              </span>
            </div>
            {item.description && (
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {item.description}
              </p>
            )}
            <p className="break-words text-sm">
              {t("consultingProject.owner")}: {item.assignee_name || t("consultingProject.empty")}
            </p>
            <p className="text-sm">
              {t("consultingProject.due")}:{" "}
              {item.due_date ? formatDate(item.due_date) : t("consultingProject.empty")}
              {item.status !== "aprovado" && item.due_date && item.due_date < today && (
                <span className="ml-2 font-medium text-destructive">
                  {t("consultingProject.overdue")}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(item.required ? "consultingProject.required" : "consultingProject.optional")}
            </p>
            {canEdit && (
              <Button
                variant="outline"
                className="min-h-11"
                disabled={editing !== null}
                onClick={() => {
                  setForm({ ...item });
                  setEditing(item.id);
                }}
              >
                {t("consultingProject.editDelivery")}
              </Button>
            )}
          </article>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("consultingProject.noDeliveries")}</p>
        )}
      </div>
    </section>
  );
}
