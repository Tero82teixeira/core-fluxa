import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, CheckCircle2, Loader2, MapPin, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { describeError } from "@/lib/errors";
import { digits, isValidCNPJ, isValidCPF, maskDocument, maskPhone } from "@/lib/format";
import { useCnpjLookup } from "@/hooks/use-cnpj-lookup";
import { captureProductEvent } from "@/lib/product-analytics";
import {
  SEGMENT_OPTIONS,
  recommendedModulesForSegment,
  segmentByKey,
  type BusinessSegment,
} from "@/lib/organization-segments";

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
      {
        name: "description",
        content: "Configure os dados da sua empresa para começar a operar na FLUXA.",
      },
      { property: "og:title", content: "Configurar empresa — FLUXA" },
      {
        property: "og:description",
        content: "Configure os dados da sua empresa para começar a operar na FLUXA.",
      },
    ],
  }),
  component: Onboarding,
});

const STEPS = [
  { title: "Segmento", icon: Sparkles, hint: "Prepare o FLUXA para sua área" },
  { title: "Empresa", icon: Building2, hint: "Identificação e contato" },
  { title: "Localização", icon: MapPin, hint: "Onde a empresa atua" },
  { title: "Operação", icon: Settings2, hint: "Serviços e porte" },
  { title: "Conclusão", icon: CheckCircle2, hint: "Revisão final" },
];

function Onboarding() {
  const navigate = useNavigate();
  const {
    user,
    status,
    organizationId,
    membership,
    ready,
    onboardingStep,
    bootstrapError,
    refreshWorkspace,
  } = useWorkspace();

  const [step, setStep] = useState(0);
  const [segment, setSegment] = useState<BusinessSegment | null>(null);
  const [saving, setSaving] = useState(false);
  const cnpjLookup = useCnpjLookup();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    document?: string;
    phone?: string;
    whatsapp?: string;
  }>({});
  const hydratedOrganization = useRef<string | null>(null);

  const savedSegment = membership?.organizations?.organization_settings?.business_segment ?? null;

  useEffect(() => {
    const resolved = savedSegment as BusinessSegment | null;
    setSegment(resolved);
    setStep(resolved ? Math.min(onboardingStep + 1, 4) : 0);
  }, [onboardingStep, savedSegment]);

  const [company, setCompany] = useState({
    trade_name: membership?.organizations?.trade_name ?? "",
    legal_name: membership?.organizations?.legal_name ?? "",
    document: "",
    phone: "",
    whatsapp: "",
  });
  const [place, setPlace] = useState({
    zip_code: "",
    street: "",
    number: "",
    district: "",
    city: "",
    state: "",
  });
  const [operation, setOperation] = useState({
    main_services: "",
    clients_range: "",
    employees_range: "",
  });

  useEffect(() => {
    const organization = membership?.organizations;
    if (!organization || hydratedOrganization.current === organization.id) return;
    hydratedOrganization.current = organization.id;
    const settings = organization.organization_settings;
    setCompany({
      trade_name: organization.trade_name ?? "",
      legal_name: organization.legal_name ?? "",
      document: organization.document ?? "",
      phone: organization.phone ?? "",
      whatsapp: organization.whatsapp ?? "",
    });
    setPlace({
      zip_code: settings?.zip_code ?? "",
      street: settings?.street ?? "",
      number: settings?.number ?? "",
      district: settings?.district ?? "",
      city: settings?.city ?? "",
      state: settings?.state ?? "",
    });
    setOperation({
      main_services: settings?.main_services ?? "",
      clients_range: settings?.clients_range ?? "",
      employees_range: settings?.employees_range ?? "",
    });
    setSegment((settings?.business_segment as BusinessSegment | null) ?? null);
  }, [membership]);

  /**
   * O vínculo é criado uma única vez pelo WorkspaceProvider (RPC idempotente).
   * Aqui apenas confirmamos que ele existe antes de qualquer escrita.
   */
  const ensureOrganization = () => {
    if (
      ready &&
      membership &&
      membership.user_id === user?.id &&
      membership.is_active &&
      membership.organizations &&
      organizationId &&
      membership.organization_id === organizationId
    )
      return organizationId;

    throw new Error(
      "Seu vínculo com a empresa ainda não está pronto. Use “Tentar novamente” para reconfigurar o acesso.",
    );
  };

  const validateCompany = () => {
    const next: typeof fieldErrors = {};
    const documentLength = digits(company.document).length;
    const phoneLength = digits(company.phone).length;
    const whatsappLength = digits(company.whatsapp).length;
    if (
      company.document &&
      !(
        (documentLength === 11 && isValidCPF(company.document)) ||
        (documentLength === 14 && isValidCNPJ(company.document))
      )
    )
      next.document = "Informe um CPF ou CNPJ válido.";
    if (company.phone && (phoneLength < 10 || phoneLength > 11))
      next.phone = "Informe o telefone com DDD.";
    if (company.whatsapp && (whatsappLength < 10 || whatsappLength > 11))
      next.whatsapp = "Informe o WhatsApp com DDD.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const fillCompanyFromCnpj = async (value: string) => {
    const found = await cnpjLookup.search(value);
    if (!found) return;
    setCompany((current) =>
      digits(current.document) === found.cnpj
        ? { ...current, legal_name: found.legalName, trade_name: found.tradeName }
        : current,
    );
  };

  const updateOnboarding = async ({
    step,
    company: companyPayload = null,
    settings = null,
    complete = false,
  }: {
    step: number;
    company?: Record<string, string | null> | null;
    settings?: Record<string, string | null> | null;
    complete?: boolean;
  }) => {
    const id = ensureOrganization();
    const { data, error: updateError } = await supabase.rpc("update_organization_onboarding", {
      _organization_id: id,
      _step: step,
      _company: companyPayload,
      _settings: settings,
      _complete: complete,
    });
    if (updateError) throw updateError;
    if (!data) throw new Error("O progresso atualizado não foi retornado.");
    return data;
  };

  const saveCompany = async () => {
    if (!company.trade_name.trim()) {
      setError("Informe o nome fantasia da empresa.");
      return false;
    }
    if (!validateCompany()) return false;
    const payload = {
      trade_name: company.trade_name.trim(),
      legal_name: company.legal_name.trim() || company.trade_name.trim(),
      document: company.document.trim() || null,
      phone: digits(company.phone) || null,
      whatsapp: digits(company.whatsapp) || null,
    };

    await updateOnboarding({ step: 1, company: payload });
    return true;
  };

  const startExploration = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const id = ensureOrganization();
      const { error: explorationError } = await (supabase as any).rpc(
        "start_organization_exploration",
        { _organization_id: id },
      );
      if (explorationError) throw explorationError;
      await refreshWorkspace();
      toast.success("Modo de exploração liberado. Você pode concluir a configuração depois.");
      navigate({ to: "/meu-dia" });
    } catch (caught) {
      const message = describeError(caught, "empresa");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const advance = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (step === 0) {
        if (!segment) {
          setError("Escolha a área principal da sua empresa ou atuação.");
          return;
        }
        const id = ensureOrganization();
        const { error: segmentError } = await (supabase as any).rpc(
          "update_organization_segment",
          {
            _organization_id: id,
            _segment: segment,
            _enabled_modules: recommendedModulesForSegment(segment),
          },
        );
        if (segmentError) throw segmentError;
        await refreshWorkspace();
        captureProductEvent("organization_segment_selected", { segment });
        toast.success("Área selecionada. Agora vamos configurar sua empresa.");
        setStep(1);
        return;
      }
      if (step === 1) {
        if (!(await saveCompany())) return;
      }
      if (step === 2) {
        await updateOnboarding({
          step: 2,
          settings: {
            zip_code: place.zip_code.trim() || null,
            street: place.street.trim() || null,
            number: place.number.trim() || null,
            district: place.district.trim() || null,
            city: place.city.trim() || null,
            state: place.state.trim().toUpperCase() || null,
          },
        });
      }
      if (step === 3) {
        await updateOnboarding({
          step: 3,
          settings: {
            main_services: operation.main_services.trim() || null,
            clients_range: operation.clients_range.trim() || null,
            employees_range: operation.employees_range.trim() || null,
          },
        });
      }
      if (step === 4) {
        await updateOnboarding({ step: 3, complete: true });
        await refreshWorkspace();
        captureProductEvent("organization_onboarding_completed");
        toast.success("Empresa configurada. Bem-vindo ao Meu Dia.");
        navigate({ to: "/meu-dia" });
        return;
      }
      toast.success("Progresso salvo.");
      setStep((current) => Math.min(current + 1, 4));
    } catch (caught) {
      console.error("Erro no vínculo da empresa", {
        message: caught instanceof Error ? caught.message : undefined,
        code: typeof caught === "object" && caught && "code" in caught ? caught.code : undefined,
        details:
          typeof caught === "object" && caught && "details" in caught ? caught.details : undefined,
        hint: typeof caught === "object" && caught && "hint" in caught ? caught.hint : undefined,
        userId: user?.id,
        organizationId,
        membershipFound: Boolean(membership),
        role: membership?.role,
        status: membership?.is_active,
      });
      const message = describeError(caught, "empresa");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const Icon = STEPS[step].icon;

  if (status === "loading" || status === "bootstrapping" || status === "idle") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Configurando seu acesso…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-blue-400/15 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-blue-400 text-slate-950 shadow-lg shadow-blue-400/20">
            <Sparkles className="size-5.5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-blue-300 uppercase">
              Primeiros passos
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Configuração da empresa
            </h1>
          </div>
        </div>
        <p className="relative mt-4 max-w-2xl text-sm leading-6 text-slate-300">
          Vamos preparar o FLUXA para a sua área e concluir a configuração em poucos passos.
          Depois, você poderá revisar essas escolhas em Configurações.
        </p>
      </header>

      <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft sm:p-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold">Seu progresso</span>
          <span className="text-muted-foreground">
            Etapa {step + 1} de {STEPS.length}
          </span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-2" />
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-5">
          {STEPS.map((item, index) => (
            <span
              key={item.title}
              aria-current={index === step ? "step" : undefined}
              className={`rounded-xl border px-3 py-2 ${
                index === step
                  ? "border-blue-500/35 bg-blue-500/10 font-semibold text-blue-700 dark:text-blue-300"
                  : index < step
                    ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
                    : "border-border/70 bg-muted/20"
              }`}
            >
              {index + 1}. {item.title}
            </span>
          ))}
        </div>
      </div>

      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardContent className="space-y-5 p-4 [&_input]:rounded-xl [&_textarea]:rounded-xl sm:p-6 lg:p-7">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-blue-500/30 bg-blue-500/10">
              <Icon className="size-5 text-blue-600 dark:text-blue-300" aria-hidden />
            </span>
            <div>
              <h2 className="card-title">{STEPS[step].title}</h2>
              <p className="helper-text">{STEPS[step].hint}</p>
            </div>
          </div>

          {(error || bootstrapError) && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error ?? bootstrapError}
            </p>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold">Qual é a área principal da sua empresa ou atuação?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  O FLUXA usará essa escolha para recomendar os módulos mais adequados. Você poderá
                  alterar a configuração depois.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SEGMENT_OPTIONS.map((option) => {
                  const SegmentIcon = option.icon;
                  const selected = segment === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setSegment(option.key);
                        setError(null);
                      }}
                      className={`group rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        selected
                          ? "border-blue-500 bg-blue-500/10 shadow-sm"
                          : "border-border/70 bg-card hover:border-blue-500/35"
                      }`}
                    >
                      <span className={`grid size-10 place-items-center rounded-xl ${
                        selected
                          ? "bg-blue-500 text-white"
                          : "bg-muted text-muted-foreground group-hover:text-blue-600"
                      }`}>
                        <SegmentIcon className="size-5" aria-hidden />
                      </span>
                      <span className="mt-3 block font-semibold">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              {segment && (
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
                  <p className="text-sm font-semibold">
                    FLUXA preparado para {segmentByKey(segment)?.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Começaremos com o núcleo operacional e os recursos recomendados para este
                    segmento. Módulos de outras áreas não serão exibidos.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome fantasia *" className="sm:col-span-2">
                <Input
                  value={company.trade_name}
                  maxLength={120}
                  onChange={(e) => setCompany({ ...company, trade_name: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Campo obrigatório.</p>
              </Field>
              <Field label="Razão social (opcional)" className="sm:col-span-2">
                <Input
                  value={company.legal_name}
                  maxLength={160}
                  onChange={(e) => setCompany({ ...company, legal_name: e.target.value })}
                />
              </Field>
              <Field label="CPF ou CNPJ">
                <Input
                  value={maskDocument(company.document)}
                  inputMode="numeric"
                  maxLength={18}
                  aria-invalid={Boolean(fieldErrors.document)}
                  onChange={(e) => {
                    const document = e.target.value;
                    setCompany({ ...company, document });
                    setFieldErrors((current) => ({ ...current, document: undefined }));
                    if (digits(document).length === 14 && isValidCNPJ(document))
                      void fillCompanyFromCnpj(document);
                  }}
                />
                {fieldErrors.document && (
                  <p className="text-sm text-destructive">{fieldErrors.document}</p>
                )}
                {cnpjLookup.loading && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Consultando CNPJ…
                  </p>
                )}
                {!cnpjLookup.loading && cnpjLookup.message && (
                  <p className="text-xs text-muted-foreground">{cnpjLookup.message}</p>
                )}
              </Field>
              <Field label="Telefone">
                <Input
                  value={maskPhone(company.phone)}
                  inputMode="numeric"
                  maxLength={15}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  onChange={(e) => {
                    setCompany({ ...company, phone: e.target.value });
                    setFieldErrors((current) => ({ ...current, phone: undefined }));
                  }}
                />
                {fieldErrors.phone && (
                  <p className="text-sm text-destructive">{fieldErrors.phone}</p>
                )}
              </Field>
              <Field label="WhatsApp">
                <Input
                  value={maskPhone(company.whatsapp)}
                  inputMode="numeric"
                  maxLength={15}
                  aria-invalid={Boolean(fieldErrors.whatsapp)}
                  onChange={(e) => {
                    setCompany({ ...company, whatsapp: e.target.value });
                    setFieldErrors((current) => ({ ...current, whatsapp: undefined }));
                  }}
                />
                {fieldErrors.whatsapp && (
                  <p className="text-sm text-destructive">{fieldErrors.whatsapp}</p>
                )}
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="CEP">
                <Input
                  value={place.zip_code}
                  maxLength={12}
                  onChange={(e) => setPlace({ ...place, zip_code: e.target.value })}
                />
              </Field>
              <Field label="Endereço">
                <Input
                  value={place.street}
                  maxLength={160}
                  onChange={(e) => setPlace({ ...place, street: e.target.value })}
                />
              </Field>
              <Field label="Número">
                <Input
                  value={place.number}
                  maxLength={12}
                  onChange={(e) => setPlace({ ...place, number: e.target.value })}
                />
              </Field>
              <Field label="Bairro">
                <Input
                  value={place.district}
                  maxLength={80}
                  onChange={(e) => setPlace({ ...place, district: e.target.value })}
                />
              </Field>
              <Field label="Cidade">
                <Input
                  value={place.city}
                  maxLength={80}
                  onChange={(e) => setPlace({ ...place, city: e.target.value })}
                />
              </Field>
              <Field label="Estado (UF)">
                <Input
                  value={place.state}
                  maxLength={2}
                  onChange={(e) => setPlace({ ...place, state: e.target.value })}
                />
              </Field>
            </div>
          )}

          {step === 3 && (
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
                <Input
                  value={operation.clients_range}
                  maxLength={40}
                  onChange={(e) => setOperation({ ...operation, clients_range: e.target.value })}
                />
              </Field>
              <Field label="Quantidade de usuários">
                <Input
                  value={operation.employees_range}
                  maxLength={40}
                  onChange={(e) => setOperation({ ...operation, employees_range: e.target.value })}
                />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Revise as informações. Ao concluir, você entrará na Central de Comando e poderá
                começar a cadastrar clientes, processos e tarefas.
              </p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Summary label="Segmento" value={segmentByKey(segment)?.label ?? ""} />
                <Summary label="Empresa" value={company.trade_name} />
                <Summary label="Razão social" value={company.legal_name || company.trade_name} />
                <Summary label="Documento" value={maskDocument(company.document)} />
                <Summary label="Telefone" value={maskPhone(company.phone)} />
                <Summary
                  label="Cidade / UF"
                  value={[place.city, place.state].filter(Boolean).join(" / ")}
                />
                <Summary label="Serviços" value={operation.main_services} />
              </dl>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
            <Button
              className="rounded-xl"
              variant="ghost"
              disabled={step === 0 || saving}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Voltar
            </Button>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              {step > 0 && step < 4 && (
                <Button
                  className="rounded-xl"
                  variant="outline"
                  onClick={startExploration}
                  disabled={saving || !ready}
                >
                  Explorar o FLUXA agora
                </Button>
              )}
              <Button
                className="w-full rounded-xl sm:w-auto"
                onClick={advance}
                disabled={saving || !ready}
                aria-busy={saving}
              >
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {saving
                  ? "Salvando…"
                  : step === 4
                    ? "Concluir configuração e entrar"
                    : "Salvar e continuar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
      <dt className="field-label">{label}</dt>
      <dd className="mt-1 text-sm">{value || "—"}</dd>
    </div>
  );
}
