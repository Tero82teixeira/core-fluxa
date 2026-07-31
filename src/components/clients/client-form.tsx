import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CLIENT_STATUS } from "@/lib/domain";
import { maskCEP, maskCNPJ, maskCPF, maskPhone } from "@/lib/format";
import {
  UF_LIST,
  validateClientForm,
  type ClientFormValues,
  type FieldErrors,
} from "@/lib/validators";

function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ClientForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  externalErrors,
}: {
  initial: ClientFormValues;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: ClientFormValues) => void;
  onCancel?: () => void;
  externalErrors?: FieldErrors;
}) {
  const [values, setValues] = useState<ClientFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const isPJ = values.person_type === "pj";
  const shown: FieldErrors = { ...errors, ...externalErrors };

  const set = (patch: Partial<ClientFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const found = validateClientForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="space-y-1.5">
        <Label>Tipo de pessoa</Label>
        <div className="flex gap-2">
          {(["pf", "pj"] as const).map((type) => (
            <Button
              key={type}
              type="button"
              variant={values.person_type === type ? "default" : "outline"}
              onClick={() => set({ person_type: type, document: "" })}
            >
              {type === "pf" ? "Pessoa física" : "Pessoa jurídica"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label={isPJ ? "Razão social" : "Nome completo"} error={shown.name} className="sm:col-span-2">
          <Input
            id="name"
            maxLength={160}
            value={values.name}
            onChange={(event) => set({ name: event.target.value })}
          />
        </Field>

        {isPJ && (
          <Field id="trade_name" label="Nome fantasia" error={shown.trade_name}>
            <Input
              id="trade_name"
              maxLength={160}
              value={values.trade_name}
              onChange={(event) => set({ trade_name: event.target.value })}
            />
          </Field>
        )}

        <Field id="document" label={isPJ ? "CNPJ" : "CPF"} error={shown.document}>
          <Input
            id="document"
            inputMode="numeric"
            value={isPJ ? maskCNPJ(values.document) : maskCPF(values.document)}
            onChange={(event) => set({ document: event.target.value })}
          />
        </Field>

        {isPJ ? (
          <Field id="legal_rep_name" label="Responsável legal" error={shown.legal_rep_name}>
            <Input
              id="legal_rep_name"
              maxLength={160}
              value={values.legal_rep_name}
              onChange={(event) => set({ legal_rep_name: event.target.value })}
            />
          </Field>
        ) : (
          <Field id="birth_date" label="Data de nascimento" error={shown.birth_date}>
            <Input
              id="birth_date"
              type="date"
              value={values.birth_date}
              onChange={(event) => set({ birth_date: event.target.value })}
            />
          </Field>
        )}
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="email" label="E-mail" error={shown.email}>
          <Input
            id="email"
            type="email"
            maxLength={255}
            value={values.email}
            onChange={(event) => set({ email: event.target.value })}
          />
        </Field>
        <Field id="phone" label="Telefone" error={shown.phone}>
          <Input
            id="phone"
            inputMode="numeric"
            value={maskPhone(values.phone)}
            onChange={(event) => set({ phone: event.target.value })}
          />
        </Field>
        <Field id="whatsapp" label="WhatsApp" error={shown.whatsapp}>
          <Input
            id="whatsapp"
            inputMode="numeric"
            value={maskPhone(values.whatsapp)}
            onChange={(event) => set({ whatsapp: event.target.value })}
          />
        </Field>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-6">
        <Field id="zip_code" label="CEP" error={shown.zip_code} className="sm:col-span-2">
          <Input
            id="zip_code"
            inputMode="numeric"
            value={maskCEP(values.zip_code)}
            onChange={(event) => set({ zip_code: event.target.value })}
          />
        </Field>
        <Field id="street" label="Endereço" error={shown.street} className="sm:col-span-3">
          <Input id="street" maxLength={160} value={values.street} onChange={(e) => set({ street: e.target.value })} />
        </Field>
        <Field id="number" label="Número" error={shown.number}>
          <Input id="number" maxLength={20} value={values.number} onChange={(e) => set({ number: e.target.value })} />
        </Field>
        <Field id="complement" label="Complemento" className="sm:col-span-3">
          <Input
            id="complement"
            maxLength={80}
            value={values.complement}
            onChange={(e) => set({ complement: e.target.value })}
          />
        </Field>
        <Field id="district" label="Bairro" className="sm:col-span-3">
          <Input id="district" maxLength={80} value={values.district} onChange={(e) => set({ district: e.target.value })} />
        </Field>
        <Field id="city" label="Cidade" className="sm:col-span-4">
          <Input id="city" maxLength={80} value={values.city} onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field id="state" label="UF" error={shown.state} className="sm:col-span-2">
          <Select value={values.state || "none"} onValueChange={(value) => set({ state: value === "none" ? "" : value })}>
            <SelectTrigger id="state" className="h-10" aria-label="UF">
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não informado</SelectItem>
              {UF_LIST.map((uf) => (
                <SelectItem key={uf} value={uf}>{uf}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="owner_name" label="Responsável interno">
          <Input
            id="owner_name"
            maxLength={120}
            value={values.owner_name}
            onChange={(e) => set({ owner_name: e.target.value })}
          />
        </Field>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={values.status} onValueChange={(value) => set({ status: value })}>
            <SelectTrigger className="h-10" aria-label="Status do cliente">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CLIENT_STATUS)
                .filter(([key]) => key !== "arquivado")
                .map(([key, meta]) => (
                  <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Field id="notes" label="Observações" className="sm:col-span-2">
          <Textarea
            id="notes"
            rows={3}
            maxLength={1000}
            value={values.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Salvando…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
