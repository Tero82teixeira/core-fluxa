import "@/i18n";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConsultingTemplatePicker } from "./consulting-template-picker";
import { ConsultingDeliveryDraft } from "./consulting-delivery-draft";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { consultingProjectValid, type ConsultingProjectValues } from "@/lib/consulting-project";
import { consultingDraftDeliveriesValid } from "@/lib/consulting-templates";

export function ConsultingTemplateDemo({
  clients,
  onCreate,
  onCancel,
}: {
  clients: { id: string; name: string }[];
  onCreate: (
    clientId: string,
    profile: ConsultingProjectValues,
    deliveries: string[],
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation(),
    id = useId(),
    lock = useRef(false);
  const [client, setClient] = useState(""),
    [deliveries, setDeliveries] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<ConsultingProjectValues>({
    title: "",
    description: "",
    owner_name: t("consultingProject.exampleOwner"),
    due_date: "",
  });
  return (
    <div className="space-y-4">
      <ConsultingTemplatePicker
        hasContent={Boolean(profile.title || profile.description || deliveries.length)}
        disabled={busy}
        onApply={(draft) => {
          setProfile((current) => ({
            ...current,
            title: draft.title,
            description: draft.description,
          }));
          setDeliveries(draft.deliveries);
        }}
      />
      <form
        className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            lock.current ||
            !client ||
            !consultingProjectValid(profile) ||
            !consultingDraftDeliveriesValid(deliveries)
          )
            return;
          lock.current = true;
          setBusy(true);
          try {
            await onCreate(client, profile, deliveries);
            toast.success(t("consultingTemplates.demoCreated"));
          } catch {
            toast.error(t("consultingProject.saveError"));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <h2 className="text-lg font-semibold">{t("consultingTemplates.projectInfo")}</h2>
        <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label htmlFor={`${id}-client`} className="grid min-w-0 gap-2 text-sm sm:col-span-2">
            {t("consultingSummary.client")}
            <select
              id={`${id}-client`}
              required
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3"
            >
              <option value="">{t("consultingTemplates.chooseClient")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={`${id}-title`} className="grid gap-2 text-sm sm:col-span-2">
            {t("consultingProject.objective")}
            <Input
              className="min-h-11"
              id={`${id}-title`}
              required
              minLength={3}
              maxLength={160}
              value={profile.title}
              onChange={(e) => setProfile({ ...profile, title: e.target.value })}
            />
          </label>
          <label htmlFor={`${id}-scope`} className="grid gap-2 text-sm sm:col-span-2">
            {t("consultingProject.scope")}
            <Textarea
              id={`${id}-scope`}
              rows={4}
              maxLength={4000}
              value={profile.description}
              onChange={(e) => setProfile({ ...profile, description: e.target.value })}
            />
          </label>
          <label htmlFor={`${id}-owner`} className="grid gap-2 text-sm">
            {t("consultingProject.owner")}
            <Input
              className="min-h-11"
              id={`${id}-owner`}
              maxLength={120}
              value={profile.owner_name}
              onChange={(e) => setProfile({ ...profile, owner_name: e.target.value })}
            />
          </label>
          <label htmlFor={`${id}-due`} className="grid gap-2 text-sm">
            {t("consultingProject.due")}
            <Input
              className="min-h-11"
              id={`${id}-due`}
              type="date"
              value={profile.due_date}
              onChange={(e) => setProfile({ ...profile, due_date: e.target.value })}
            />
          </label>
          <div className="min-w-0 sm:col-span-2">
            <ConsultingDeliveryDraft titles={deliveries} onChange={setDeliveries} disabled={busy} />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="submit"
              className="min-h-11 w-full sm:w-auto"
              disabled={
                busy ||
                !client ||
                !consultingProjectValid(profile) ||
                !consultingDraftDeliveriesValid(deliveries)
              }
            >
              {t(busy ? "consultingProject.saving" : "consultingTemplates.demoCreate")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              onClick={onCancel}
            >
              {t("consultingProject.cancel")}
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
