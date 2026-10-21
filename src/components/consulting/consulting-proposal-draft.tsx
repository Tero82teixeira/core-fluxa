import "@/i18n";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CONSULTING_PROPOSAL_FREQUENCIES,
  consultingProposalDraftValid,
  type ConsultingProposalDraft as Draft,
} from "@/lib/consulting-proposal";
export function ConsultingProposalDraft({
  initial,
  clientName,
  today,
  onSave,
  onCancel,
}: {
  initial: Draft;
  clientName: string;
  today: string;
  onSave: (draft: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [form, setForm] = useState(initial),
    [saving, setSaving] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const locked = useRef(false);
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-primary/30 bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t("consultingProposal.title")}</h2>
      <p className="break-words text-sm font-medium">{clientName}</p>
      <p className="text-sm text-muted-foreground">{t("consultingProposal.hint")}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (locked.current || uncertain || !consultingProposalDraftValid(form, today)) return;
          locked.current = true;
          setSaving(true);
          try {
            await onSave(form);
          } catch {
            setUncertain(true);
          } finally {
            locked.current = false;
            setSaving(false);
          }
        }}
      >
        <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label htmlFor={`${id}-title`} className="grid min-w-0 gap-2 text-sm sm:col-span-2">
            {t("consultingProposal.proposalTitle")}
            <Input
              id={`${id}-title`}
              className="min-h-11"
              required
              minLength={3}
              maxLength={180}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label htmlFor={`${id}-service`} className="grid min-w-0 gap-2 text-sm sm:col-span-2">
            {t("consultingProposal.service")}
            <Textarea
              id={`${id}-service`}
              rows={5}
              required
              minLength={3}
              maxLength={2000}
              value={form.serviceDescription}
              onChange={(e) => setForm({ ...form, serviceDescription: e.target.value })}
            />
            <span className="text-muted-foreground">{t("consultingProposal.serviceHint")}</span>
          </label>
          <label htmlFor={`${id}-terms`} className="grid min-w-0 gap-2 text-sm sm:col-span-2">
            {t("consultingProposal.terms")}
            <Textarea
              id={`${id}-terms`}
              rows={4}
              required
              minLength={3}
              maxLength={4000}
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
            />
          </label>
          <label htmlFor={`${id}-amount`} className="grid min-w-0 gap-2 text-sm">
            {t("consultingProposal.amount")}
            <Input
              id={`${id}-amount`}
              className="min-h-11"
              inputMode="decimal"
              required
              maxLength={15}
              placeholder="1500,00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <span className="text-muted-foreground">{t("consultingProposal.amountHint")}</span>
          </label>
          <label htmlFor={`${id}-frequency`} className="grid min-w-0 gap-2 text-sm">
            {t("consultingProposal.frequency")}
            <select
              id={`${id}-frequency`}
              className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
              value={form.billingFrequency}
              onChange={(e) =>
                setForm({ ...form, billingFrequency: e.target.value as Draft["billingFrequency"] })
              }
            >
              {CONSULTING_PROPOSAL_FREQUENCIES.map((key) => (
                <option key={key} value={key}>
                  {t(`consultingProposal.frequencies.${key}`)}
                </option>
              ))}
            </select>
          </label>
          {(["firstDueDate", "validUntil"] as const).map((key) => (
            <label key={key} htmlFor={`${id}-${key}`} className="grid min-w-0 gap-2 text-sm">
              {t(`consultingProposal.${key}`)}
              <Input
                id={`${id}-${key}`}
                className="min-h-11"
                type="date"
                min={today}
                max="2100-12-31"
                required
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <p className="text-sm text-muted-foreground sm:col-span-2">
            {t("consultingProposal.dateHint")}
          </p>
          {uncertain && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {t("consultingProposal.uncertain")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              className="min-h-11"
              type="submit"
              disabled={saving || uncertain || !consultingProposalDraftValid(form, today)}
            >
              {t(saving ? "consultingProposal.saving" : "consultingProposal.save")}
            </Button>
            <Button className="min-h-11" type="button" variant="outline" onClick={onCancel}>
              {t("consultingProposal.cancel")}
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
