import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyPreferences } from "@/lib/real-estate-preferences";
import {
  validateManualAttendance,
  type ManualAttendanceValues,
} from "@/lib/real-estate-manual-attendance";
import { PreferencesForm } from "./preference-selection";
export function ManualAttendanceForm({
  responsibles,
  initialResponsible = "",
  busy,
  onCreate,
  now,
}: {
  responsibles: { id: string; name: string }[];
  initialResponsible?: string;
  busy: boolean;
  onCreate: (v: ManualAttendanceValues) => Promise<void>;
  now?: number;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.manual.${k}`);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    origin: "whatsapp" as ManualAttendanceValues["origin"],
    responsible_user_id: initialResponsible,
    next_contact_at: "",
    internal_note: "",
  });
  return (
    <PreferencesForm
      initial={emptyPreferences("locacao")}
      writable
      busy={busy}
      submitLabel={l("create")}
      onSave={async (preferences) => {
        let v;
        try {
          v = validateManualAttendance(
            {
              ...form,
              preferences,
              next_contact_at: form.next_contact_at
                ? new Date(form.next_contact_at).toISOString()
                : null,
            },
            now,
          );
        } catch {
          toast.error(l("invalid"));
          return;
        }
        await onCreate(v);
      }}
    >
      <div className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-2">
        <Label className="block min-w-0 space-y-2">
          {l("name")}
          <Input
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Label>
        <Label className="block min-w-0 space-y-2">
          {l("phone")}
          <Input
            required
            type="tel"
            maxLength={25}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Label>
        <Label className="block min-w-0 space-y-2">
          {l("origin")}
          <select
            className="min-h-11 w-full rounded-md border bg-background px-3"
            value={form.origin}
            onChange={(e) =>
              setForm({ ...form, origin: e.target.value as ManualAttendanceValues["origin"] })
            }
          >
            {["whatsapp", "telefone", "presencial", "outro"].map((k) => (
              <option key={k} value={k}>
                {l(k)}
              </option>
            ))}
          </select>
        </Label>
        <Label className="block min-w-0 space-y-2">
          {l("responsible")}
          <select
            className="min-h-11 w-full rounded-md border bg-background px-3"
            value={form.responsible_user_id}
            onChange={(e) => setForm({ ...form, responsible_user_id: e.target.value })}
          >
            <option value="">{l("unassigned")}</option>
            {responsibles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Label>
        <Label className="block min-w-0 space-y-2 sm:col-span-2">
          {l("nextContact")}
          <Input
            type="datetime-local"
            value={form.next_contact_at}
            onChange={(e) => setForm({ ...form, next_contact_at: e.target.value })}
          />
        </Label>
        <Label className="block min-w-0 space-y-2 sm:col-span-2">
          {l("note")}
          <textarea
            maxLength={2000}
            className="w-full rounded-md border bg-background p-3"
            value={form.internal_note}
            onChange={(e) => setForm({ ...form, internal_note: e.target.value })}
          />
        </Label>
        <p className="text-sm text-muted-foreground sm:col-span-2">{l("preferences")}</p>
      </div>
    </PreferencesForm>
  );
}
