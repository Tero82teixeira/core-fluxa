import { useEffect, useState } from "react";
import { Loader2, Scale, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  LEGAL_AREAS,
  LEGAL_CASE_SIDES,
  formatCnjNumber,
  useLegalCaseProfile,
  useUpsertLegalCaseProfile,
  type LegalArea,
  type LegalCaseSide,
} from "@/hooks/use-legal-cases";
import { describeError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const EMPTY_FORM = {
  cnj_number: "",
  legal_area: "" as LegalArea | "",
  action_type: "",
  court: "",
  judicial_unit: "",
  district: "",
  state: "",
  opposing_party: "",
  case_side: "" as LegalCaseSide | "",
  confidential: false,
  next_hearing_at: "",
};

function localDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function LegalCaseProfilePanel({
  organizationId,
  processId,
  canEdit,
}: {
  organizationId: string | null;
  processId: string;
  canEdit: boolean;
}) {
  const profile = useLegalCaseProfile(organizationId, processId);
  const saveProfile = useUpsertLegalCaseProfile(organizationId, processId);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!profile.isSuccess) return;
    const data = profile.data;
    setForm(
      data
        ? {
            cnj_number: formatCnjNumber(data.cnj_number),
            legal_area: data.legal_area ?? "",
            action_type: data.action_type ?? "",
            court: data.court ?? "",
            judicial_unit: data.judicial_unit ?? "",
            district: data.district ?? "",
            state: data.state ?? "",
            opposing_party: data.opposing_party ?? "",
            case_side: data.case_side ?? "",
            confidential: data.confidential,
            next_hearing_at: localDateTimeInput(data.next_hearing_at),
          }
        : EMPTY_FORM,
    );
  }, [profile.data, profile.isSuccess]);

  if (profile.isLoading) {
    return <Skeleton className="h-80 w-full rounded-2xl" />;
  }

  if (profile.isError) {
    return (
      <Card className="rounded-2xl border-destructive/25">
        <CardContent className="p-5 text-sm text-muted-foreground">
          Não foi possível carregar os dados jurídicos deste processo.
        </CardContent>
      </Card>
    );
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const cnjDigits = form.cnj_number.replace(/\D/g, "");
    if (cnjDigits && cnjDigits.length !== 20) {
      toast.error("O número CNJ precisa ter 20 dígitos.");
      return;
    }
    try {
      await saveProfile.mutateAsync({
        cnj_number: cnjDigits || null,
        legal_area: form.legal_area || null,
        action_type: form.action_type.trim() || null,
        court: form.court.trim() || null,
        judicial_unit: form.judicial_unit.trim() || null,
        district: form.district.trim() || null,
        state: form.state.trim().toUpperCase() || null,
        opposing_party: form.opposing_party.trim() || null,
        case_side: form.case_side || null,
        confidential: form.confidential,
        next_hearing_at: form.next_hearing_at ? new Date(form.next_hearing_at).toISOString() : null,
      });
      toast.success("Dados jurídicos salvos.");
    } catch (error) {
      toast.error(describeError(error, "processo"));
    }
  };

  return (
    <Card className="rounded-2xl border-amber-500/20 shadow-soft">
      <CardContent className="p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Scale className="size-4 text-amber-600" aria-hidden /> Dados jurídicos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Identificação judicial e informações essenciais do caso.
            </p>
          </div>
          {form.confidential && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              <ShieldCheck className="size-3.5" aria-hidden /> Segredo de justiça
            </span>
          )}
        </div>

        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="legal-cnj">Número CNJ</Label>
            <Input
              id="legal-cnj"
              inputMode="numeric"
              placeholder="0000000-00.0000.0.00.0000"
              value={form.cnj_number}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  cnj_number: formatCnjNumber(event.target.value),
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Área do Direito</Label>
            <Select
              value={form.legal_area || "none"}
              disabled={!canEdit}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  legal_area: value === "none" ? "" : (value as LegalArea),
                }))
              }
            >
              <SelectTrigger aria-label="Área do Direito">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não informada</SelectItem>
                {Object.entries(LEGAL_AREAS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Field
            label="Tipo de ação"
            value={form.action_type}
            disabled={!canEdit}
            maxLength={160}
            onChange={(value) => setForm((current) => ({ ...current, action_type: value }))}
          />
          <Field
            label="Tribunal"
            value={form.court}
            disabled={!canEdit}
            maxLength={160}
            onChange={(value) => setForm((current) => ({ ...current, court: value }))}
          />
          <Field
            label="Vara / unidade judicial"
            value={form.judicial_unit}
            disabled={!canEdit}
            maxLength={160}
            onChange={(value) => setForm((current) => ({ ...current, judicial_unit: value }))}
          />
          <Field
            label="Comarca"
            value={form.district}
            disabled={!canEdit}
            maxLength={120}
            onChange={(value) => setForm((current) => ({ ...current, district: value }))}
          />
          <Field
            label="UF"
            value={form.state}
            disabled={!canEdit}
            maxLength={2}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                state: value.toUpperCase().replace(/[^A-Z]/g, ""),
              }))
            }
          />
          <Field
            label="Parte contrária"
            value={form.opposing_party}
            disabled={!canEdit}
            maxLength={180}
            onChange={(value) => setForm((current) => ({ ...current, opposing_party: value }))}
          />

          <div className="space-y-1.5">
            <Label>Polo do cliente</Label>
            <Select
              value={form.case_side || "none"}
              disabled={!canEdit}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  case_side: value === "none" ? "" : (value as LegalCaseSide),
                }))
              }
            >
              <SelectTrigger aria-label="Polo do cliente">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não informado</SelectItem>
                {Object.entries(LEGAL_CASE_SIDES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="legal-hearing">Próxima audiência</Label>
            <Input
              id="legal-hearing"
              type="datetime-local"
              value={form.next_hearing_at}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((current) => ({ ...current, next_hearing_at: event.target.value }))
              }
            />
          </div>

          <label className="flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--brand)]"
              checked={form.confidential}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((current) => ({ ...current, confidential: event.target.checked }))
              }
            />
            Segredo de justiça
          </label>

          {canEdit && (
            <div className="flex justify-end border-t pt-4 sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={saveProfile.isPending}>
                {saveProfile.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {saveProfile.isPending ? "Salvando…" : "Salvar dados jurídicos"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  disabled,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  const id = `legal-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
