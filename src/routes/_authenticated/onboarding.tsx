import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Loader2, MapPin, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { describeError } from "@/lib/errors";
import { digits } from "@/lib/format";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Configurar empresa — FLUXA" },
      { name: "description", content: "Configure os dados da sua empresa para começar a operar na FLUXA." },
      { property: "og:title", content: "Configurar empresa — FLUXA" },
      { property: "og:description", content: "Configure os dados da sua empresa para começar a operar na FLUXA." },
    ],
  }),
  component: Onboarding,
});

const STEPS = [
  { title: "Empresa", icon: Building2, hint: "Identificação e contato" },
  { title: "Localização", icon: MapPin, hint: "Onde a empresa atua" },
  { title: "Operação", icon: Settings2, hint: "Serviços e porte" },
  { title: "Conclusão", icon: CheckCircle2, hint: "Revisão final" },
];

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, organizationId, membership, loading, bootstrapError } = useWorkspace();
  const [orgId, setOrgId] = useState<string | null>(organizationId);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId) setOrgId(organizationId);
  }, [organizationId]);

  const [company, setCompany] = useState({
    trade_name: membership?.organizations?.trade_name ?? "",
    legal_name: membership?.organizations?.legal_name ?? "",
    document: "",
    phone: "",
    whatsapp: "",
  });
  const [place, setPlace] = useState({ zip_code: "", street: "", number: "", district: "", city: "", state: "" });
  const [operation, setOperation] = useState({ main_services: "", clients_range: "", employees_range: "" });

  /** Garante empresa + vínculo antes de qualquer escrita (idempotente no banco). */
  const ensureOrganization = async () => {
    if (orgId) return orgId;
    const { data, error: rpcError } = await supabase.rpc("bootstrap_organization");
    if (rpcError) throw rpcError;
    const created = data?.[0]?.organization_id ?? null;
    if (!created) throw new Error("Não foi possível preparar sua empresa.");
    setOrgId(created);
    await queryClient.invalidateQueries({ queryKey: ["memberships"] });
    return created;
  };

  const saveCompany = async () => {
    if (!company.trade_name.trim()) {
      setError("Informe o nome fantasia da empresa.");
      return false;
    }
    const id = await ensureOrganization();
    const payload = {
      trade_name: company.trade_name.trim(),
      legal_name: company.legal_name.trim() || company.trade_name.trim(),
      document: company.document.trim() || null,
      document_digits: digits(company.document) || null,
      phone: company.phone.trim() || null,
      whatsapp: company.whatsapp.trim() || null,
    };

    const { error: updateError } = await supabase.from("organizations").update(payload).eq("id", id);
    if (updateError) throw updateError;

    await supabase
      .from("organization_settings")
      .upsert({ organization_id: id, portal_name: payload.trade_name }, { onConflict: "organization_id" });

    await queryClient.invalidateQueries({ queryKey: ["memberships"] });
    return true;
  };

  const saveSettings = async (values: Record<string, string | null>) => {
    if (!orgId) return false;
    const { error: settingsError } = await supabase
      .from("organization_settings")
      .update(values as never)
      .eq("organization_id", orgId);
    if (settingsError) throw settingsError;
    return true;
  };

  const advance = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (step === 0) {
        if (!(await saveCompany())) return;
      }
      if (step === 1) {
        await saveSettings({
          zip_code: place.zip_code.trim() || null,
          street: place.street.trim() || null,
          number: place.number.trim() || null,
          district: place.district.trim() || null,
          city: place.city.trim() || null,
          state: place.state.trim().toUpperCase() || null,
        });
      }
      if (step === 2) {
        await saveSettings({
          main_services: operation.main_services.trim() || null,
          clients_range: operation.clients_range.trim() || null,
          employees_range: operation.employees_range.trim() || null,
        });
      }
      if (step === 3) {
        const { error: finishError } = await supabase
          .from("organizations")
          .update({ onboarding_completed: true })
          .eq("id", orgId!);
        if (finishError) throw finishError;
        await queryClient.invalidateQueries({ queryKey: ["memberships"] });
        toast.success("Empresa configurada. Bem-vindo à Central de Comando.");
        navigate({ to: "/central" });
        return;
      }
      toast.success("Progresso salvo.");
      setStep((current) => Math.min(current + 1, 3));
    } catch (caught) {
      const message = describeError(caught, "empresa");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const Icon = STEPS[step].icon;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="page-title">Configuração da empresa</h1>
        <p className="page-subtitle">
          Quatro etapas rápidas. Você pode salvar e concluir depois — nada se perde.
        </p>
      </header>

      <div className="space-y-2">
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {STEPS.map((item, index) => (
            <span key={item.title} className={index === step ? "font-semibold text-brand" : ""}>
              {index + 1}. {item.title}
            </span>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-brand/30 bg-brand/10">
              <Icon className="size-5 text-brand" aria-hidden />
            </span>
            <div>
              <h2 className="card-title">{STEPS[step].title}</h2>
              <p className="helper-text">{STEPS[step].hint}</p>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome fantasia" className="sm:col-span-2">
                <Input value={company.trade_name} maxLength={120} onChange={(e) => setCompany({ ...company, trade_name: e.target.value })} />
              </Field>
              <Field label="Razão social (opcional)" className="sm:col-span-2">
                <Input value={company.legal_name} maxLength={160} onChange={(e) => setCompany({ ...company, legal_name: e.target.value })} />
              </Field>
              <Field label="CPF ou CNPJ">
                <Input value={company.document} maxLength={20} onChange={(e) => setCompany({ ...company, document: e.target.value })} />
              </Field>
              <Field label="Telefone">
                <Input value={company.phone} maxLength={20} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
              </Field>
              <Field label="WhatsApp">
                <Input value={company.whatsapp} maxLength={20} onChange={(e) => setCompany({ ...company, whatsapp: e.target.value })} />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="CEP">
                <Input value={place.zip_code} maxLength={12} onChange={(e) => setPlace({ ...place, zip_code: e.target.value })} />
              </Field>
              <Field label="Endereço">
                <Input value={place.street} maxLength={160} onChange={(e) => setPlace({ ...place, street: e.target.value })} />
              </Field>
              <Field label="Número">
                <Input value={place.number} maxLength={12} onChange={(e) => setPlace({ ...place, number: e.target.value })} />
              </Field>
              <Field label="Bairro">
                <Input value={place.district} maxLength={80} onChange={(e) => setPlace({ ...place, district: e.target.value })} />
              </Field>
              <Field label="Cidade">
                <Input value={place.city} maxLength={80} onChange={(e) => setPlace({ ...place, city: e.target.value })} />
              </Field>
              <Field label="Estado (UF)">
                <Input value={place.state} maxLength={2} onChange={(e) => setPlace({ ...place, state: e.target.value })} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Principais serviços" className="sm:col-span-2">
                <Textarea
                  rows={3}
                  maxLength={500}
                  value={operation.main_services}
                  onChange={(e) => setOperation({ ...operation, main_services: e.target.value })}
                />
              </Field>
              <Field label="Quantidade aproximada de clientes">
                <Input value={operation.clients_range} maxLength={40} onChange={(e) => setOperation({ ...operation, clients_range: e.target.value })} />
              </Field>
              <Field label="Quantidade de usuários">
                <Input value={operation.employees_range} maxLength={40} onChange={(e) => setOperation({ ...operation, employees_range: e.target.value })} />
              </Field>
            </div>
          )}

          {step === 3 && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Summary label="Empresa" value={company.trade_name} />
              <Summary label="Razão social" value={company.legal_name || company.trade_name} />
              <Summary label="Documento" value={company.document} />
              <Summary label="Telefone" value={company.phone} />
              <Summary label="Cidade / UF" value={[place.city, place.state].filter(Boolean).join(" / ")} />
              <Summary label="Serviços" value={operation.main_services} />
            </dl>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button variant="ghost" disabled={step === 0 || saving} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Voltar
            </Button>
            <div className="flex items-center gap-2">
              {orgId && step < 3 && (
                <Button variant="outline" disabled={saving} onClick={() => navigate({ to: "/central" })}>
                  Concluir depois
                </Button>
              )}
              <Button onClick={advance} disabled={saving} aria-busy={saving}>
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {saving ? "Salvando…" : step === 3 ? "Entrar na Central de Comando" : "Salvar e continuar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="field-label">{label}</dt>
      <dd className="mt-1 text-sm">{value || "—"}</dd>
    </div>
  );
}
