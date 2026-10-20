import "@/i18n";
import { useState, useId } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  validMonthlyPlan,
  parseMonthlyAmount,
  monthInPlan,
  monthlyPlanError,
  monthlyDueDate,
  monthlyPlanAttention,
  type MonthlyPlanValues,
  type MonthlyWorkspace,
} from "@/lib/consulting-plans";
export function ConsultingMonthlyPlanCard({
  workspace,
  canEdit,
  canGenerate,
  month,
  onMonth,
  onSave,
  onGenerate,
  formatDate,
  money,
  initialTitle,
  today,
}: {
  workspace: MonthlyWorkspace;
  canEdit: boolean;
  canGenerate: boolean;
  month: string;
  onMonth: (month: string) => void;
  onSave: (values: MonthlyPlanValues, revision: number | null) => Promise<void>;
  onGenerate: () => Promise<{ created: number; existing: number }>;
  formatDate: (date: string) => string;
  money: (value: number) => string;
  initialTitle: string;
  today: string;
}) {
  const { t } = useTranslation(),
    id = useId(),
    plan = workspace.plan;
  const initial: MonthlyPlanValues = plan ?? {
    service_name: initialTitle,
    monthly_amount: 0,
    starts_on: today,
    ends_on: `${today.slice(0, 4)}-12-31`,
    status: "ativo",
    return_on: null,
    routine: [{ title: "", day: 5 }],
  };
  const [editing, setEditing] = useState(false),
    [form, setForm] = useState(initial),
    [amount, setAmount] = useState(String(initial.monthly_amount)),
    [revision, setRevision] = useState<number | null>(plan?.revision ?? null),
    [busy, setBusy] = useState(false);
  const values = { ...form, monthly_amount: parseMonthlyAmount(amount) };
  const amountInvalid =
    !Number.isFinite(values.monthly_amount) || values.monthly_amount > 9999999999.99;
  const attention = plan ? monthlyPlanAttention(plan, today) : null;
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("consultingPlans.title")}</h2>
        {canEdit && !editing && (
          <Button
            className="min-h-11"
            variant="outline"
            onClick={() => {
              setForm(initial);
              setAmount(String(initial.monthly_amount));
              setRevision(plan?.revision ?? null);
              setEditing(true);
            }}
          >
            {t(plan ? "consultingPlans.edit" : "consultingPlans.create")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("consultingPlans.notice")}</p>
      {editing && canEdit ? (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !validMonthlyPlan(values)) return;
            setBusy(true);
            try {
              await onSave(values, revision);
              setEditing(false);
              toast.success(t("consultingPlans.saved"));
            } catch (error) {
              toast.error(t(monthlyPlanError(error)));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="grid gap-2 text-sm sm:col-span-2" htmlFor={`${id}-name`}>
            {t("consultingPlans.service")}
            <Input
              id={`${id}-name`}
              maxLength={160}
              required
              minLength={3}
              value={form.service_name}
              onChange={(e) => setForm({ ...form, service_name: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm" htmlFor={`${id}-amount`}>
            {t("consultingPlans.amount")}
            <Input
              id={`${id}-amount`}
              inputMode="decimal"
              required
              aria-invalid={amountInvalid}
              aria-describedby={`${id}-amount-hint`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1500,00"
            />
            <span
              id={`${id}-amount-hint`}
              className={
                amountInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {t(amountInvalid ? "consultingPlans.amountInvalid" : "consultingPlans.amountHint")}
            </span>
          </label>
          <label className="grid gap-2 text-sm" htmlFor={`${id}-status`}>
            {t("consultingPlans.status")}
            <select
              id={`${id}-status`}
              className="min-h-11 rounded-lg border bg-background px-3"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as MonthlyPlanValues["status"] })
              }
            >
              {(["ativo", "pausado", "encerrado"] as const).map((s) => (
                <option value={s} key={s}>
                  {t(`consultingPlans.statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
          {(["starts_on", "ends_on", "return_on"] as const).map((key) => (
            <label className="grid gap-2 text-sm" key={key} htmlFor={`${id}-${key}`}>
              {t(`consultingPlans.${key}`)}
              <Input
                id={`${id}-${key}`}
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                required={key !== "return_on"}
                value={form[key] ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="space-y-3 sm:col-span-2">
            <h3 className="font-medium">{t("consultingPlans.routine")}</h3>
            <p className="text-xs text-muted-foreground">{t("consultingPlans.daysHint")}</p>
            {form.routine.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_6rem_auto]"
              >
                <label className="grid gap-1 text-sm">
                  {t("consultingPlans.activity")}
                  <Input
                    aria-label={`${t("consultingPlans.activity")} ${index + 1}`}
                    maxLength={160}
                    value={item.title}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        routine: form.routine.map((row, i) =>
                          i === index ? { ...row, title: e.target.value } : row,
                        ),
                      })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  {t("consultingPlans.day")}
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={item.day}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        routine: form.routine.map((row, i) =>
                          i === index ? { ...row, day: Number(e.target.value) } : row,
                        ),
                      })
                    }
                  />
                </label>
                <Button
                  type="button"
                  className="min-h-11 self-end"
                  variant="outline"
                  disabled={form.routine.length === 1}
                  onClick={() =>
                    setForm({ ...form, routine: form.routine.filter((_, i) => i !== index) })
                  }
                >
                  {t("consultingPlans.remove")}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              className="min-h-11"
              variant="outline"
              disabled={form.routine.length >= 20}
              onClick={() =>
                setForm({ ...form, routine: [...form.routine, { title: "", day: 5 }] })
              }
            >
              {t("consultingPlans.add")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button className="min-h-11" type="submit" disabled={busy || !validMonthlyPlan(values)}>
              {t(busy ? "consultingProject.saving" : "consultingProject.save")}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              {t("consultingProject.cancel")}
            </Button>
          </div>
        </form>
      ) : plan ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="break-words font-medium sm:col-span-2">{plan.service_name}</p>
            <p>
              {t("consultingPlans.amount")}: {money(plan.monthly_amount)}
            </p>
            <p>{t(`consultingPlans.statuses.${plan.status}`)}</p>
            <p>
              {formatDate(plan.starts_on)} — {formatDate(plan.ends_on)}
            </p>
            <p>
              {t("consultingPlans.return_on")}:{" "}
              {plan.return_on ? formatDate(plan.return_on) : t("consultingProject.empty")}
            </p>
          </div>
          {attention && (attention.ending || attention.expired || attention.returnDue) && (
            <div className="flex flex-wrap gap-2 text-sm text-primary">
              {attention.expired && <span>{t("consultingPlans.expired")}</span>}
              {attention.ending && <span>{t("consultingPlans.ending")}</span>}
              {attention.returnDue && <span>{t("consultingPlans.returnDue")}</span>}
            </div>
          )}
          <ul className="space-y-1 text-sm text-muted-foreground">
            {plan.routine.map((activity, index) => (
              <li className="break-words" key={index}>
                {t("consultingPlans.onDay", { day: activity.day })}: {activity.title}
              </li>
            ))}
          </ul>
          <div className="space-y-3 rounded-xl border p-4">
            <label className="grid max-w-xs gap-2 text-sm" htmlFor={`${id}-month`}>
              {t("consultingPlans.month")}
              <Input
                id={`${id}-month`}
                type="month"
                value={month}
                onChange={(e) => onMonth(e.target.value)}
              />
            </label>
            {!workspace.generated && monthInPlan(month, plan) && (
              <ConsultingRoutinePreview plan={plan} month={month} formatDate={formatDate} />
            )}
            {workspace.generated ? (
              <p className="text-sm font-medium">{t("consultingPlans.generated")}</p>
            ) : (
              <Button
                className="min-h-11"
                disabled={
                  !canGenerate ||
                  busy ||
                  plan.status !== "ativo" ||
                  !monthInPlan(month, plan) ||
                  editing
                }
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  try {
                    const result = await onGenerate();
                    toast.success(
                      t(
                        result.created ? "consultingPlans.createdTasks" : "consultingPlans.already",
                        { count: result.created || result.existing },
                      ),
                    );
                  } catch (error) {
                    toast.error(t(monthlyPlanError(error)));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("consultingPlans.generate")}
              </Button>
            )}
            {!workspace.generated && plan.status !== "ativo" && (
              <p className="text-sm text-muted-foreground">{t("consultingPlans.inactive")}</p>
            )}
            {!monthInPlan(month, plan) && (
              <p className="text-sm text-muted-foreground">{t("consultingPlans.outside")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("consultingPlans.generationHint")}</p>
            <ul className="space-y-2">
              {workspace.tasks.map((task) => (
                <li key={task.id} className="rounded-lg bg-muted/40 p-3 text-sm">
                  <p className="break-words font-medium">{task.title}</p>
                  <p className="text-muted-foreground">
                    {formatDate(task.due_date)} ·{" "}
                    {task.deleted
                      ? t("consultingPlans.archivedTask")
                      : t(`consultingPlans.taskStatuses.${task.status}`, {
                          defaultValue: task.status,
                        })}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("consultingPlans.empty")}</p>
      )}
    </section>
  );
}

export function ConsultingRoutinePreview({
  plan,
  month,
  formatDate,
}: {
  plan: MonthlyPlanValues;
  month: string;
  formatDate: (date: string) => string;
}) {
  const { t } = useTranslation();
  if (!monthInPlan(month, plan)) return null;
  return (
    <div className="space-y-2 rounded-xl bg-muted/30 p-3">
      <h3 className="text-sm font-medium">
        {t("consultingPlans.previewTitle", { count: plan.routine.length })}
      </h3>
      <p className="text-xs text-muted-foreground">{t("consultingPlans.previewHint")}</p>
      <ul className="space-y-2">
        {plan.routine.map((activity, index) => (
          <li key={index} className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="min-w-0 break-words">{activity.title}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatDate(monthlyDueDate(month, activity.day, plan))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
