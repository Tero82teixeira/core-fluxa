import { useConsultingProposalSource, useConsultingSourceClient } from "@/hooks/use-consulting-proposal-source";
import { ConsultingProposalSourceCard, ConsultingProposalSourceStatus } from "@/components/consulting/consulting-proposal-source-card";
import { consultingProjectFromProposal, consultingSourceReady, consultingSourceClient, consultingSourceIdValid, type ConsultingProposalSource } from "@/lib/consulting-project-source";
import { routeVisibleForModules } from "@/lib/organization-segments";
import { ConsultingTemplatePicker } from "@/components/consulting/consulting-template-picker";
import { ConsultingDeliveryDraft } from "@/components/consulting/consulting-delivery-draft";
import { consultingDraftDeliveriesValid, consultingDraftDeliveries, createProjectWithSuggestedDeliveries, applyConsultingTemplate } from "@/lib/consulting-templates";
import { useTranslation } from "react-i18next";
import { consultingProjectValid } from "@/lib/consulting-project";
import { processStageDefinitions } from "@/lib/consulting-workspace";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BriefcaseBusiness, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClients } from "@/hooks/use-operations";
import { useAllServiceTypes, useCreateProcess, useSeedChecklist } from "@/hooks/use-mutations";
import { describeError } from "@/lib/errors";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  KANBAN_STAGES,
  PRIORITY,
  PROCESS_STAGE,
  type PriorityLevel,
  type ProcessStage,
} from "@/lib/domain";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Search = { clientId?: string; proposalId?: string };

export const Route = createFileRoute("/_authenticated/processos/novo")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    clientId: typeof search.clientId === "string" ? search.clientId : undefined,
    proposalId: typeof search.proposalId === "string" ? search.proposalId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Novo processo — FLUXA" },
      {
        name: "description",
        content: "Abra um novo processo com cliente, etapa inicial, prazo e responsável.",
      },
      { property: "og:title", content: "Novo processo — FLUXA" },
      {
        property: "og:description",
        content: "Abra um novo processo com cliente, etapa inicial, prazo e responsável.",
      },
    ],
  }),
  component: NewProcess,
});

function addDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function NewProcess() {
  const { proposalId } = Route.useSearch();
  const { organizationId, membership } = useWorkspace();
  const permissions = usePermissions();
  const settings = membership?.organizations?.organization_settings;
  const navigate = useNavigate();
  const allowed = Boolean(permissions.canCreate && permissions.canViewReports && settings?.business_segment === "consulting_services" && routeVisibleForModules("/relatorios",settings.business_segment,settings.enabled_modules) && routeVisibleForModules("/processos",settings.business_segment,settings.enabled_modules));
  const source = useConsultingProposalSource(organizationId,proposalId,allowed);
  const sourceClient = useConsultingSourceClient(organizationId,source.data ? consultingSourceClient(source.data) : null, allowed && consultingSourceReady(source.data,organizationId));
  if(!proposalId)return <NewProcessForm key={organizationId}/>;
  const back=()=>void navigate({to:"/processos"});
  if(!allowed || !consultingSourceIdValid(proposalId))return <ConsultingProposalSourceStatus status="invalid" onBack={back}/>;
  if(source.isPending)return <ConsultingProposalSourceStatus status="loading" onBack={back}/>;
  if(source.isError)return <ConsultingProposalSourceStatus status="error" onBack={back} onRetry={()=>{void source.refetch();}}/>;
  if(!consultingSourceReady(source.data,organizationId))return <ConsultingProposalSourceStatus status="invalid" onBack={back}/>;
  if(sourceClient.isPending)return <ConsultingProposalSourceStatus status="loading" onBack={back}/>;
  if(sourceClient.isError)return <ConsultingProposalSourceStatus status="error" onBack={back} onRetry={()=>void sourceClient.refetch()}/>;
  if(!sourceClient.data?.id || !sourceClient.data.name)return <ConsultingProposalSourceStatus status="invalid" onBack={back}/>;
  return <NewProcessForm key={`${organizationId}:${source.data!.id}`} source={source.data!} sourceClient={{id:sourceClient.data.id,name:sourceClient.data.name}}/>;
}

function NewProcessForm({source,sourceClient}:{source?:ConsultingProposalSource;sourceClient?:{id:string;name:string}}) {
  const navigate = useNavigate();
  const {t}=useTranslation();
  const submitLock=useRef(false);
  const [submitting,setSubmitting]=useState(false);
  const { clientId } = Route.useSearch();
  const { organizationId, displayName, membership } = useWorkspace();
  const isConsulting = membership?.organizations?.organization_settings?.business_segment === "consulting_services";
  const permissions = usePermissions();
  const clients = useClients(source ? null : organizationId);
  const serviceTypes = useAllServiceTypes(organizationId);
  const createProcess = useCreateProcess(organizationId);
  const seedChecklist = useSeedChecklist(organizationId);
  const [pendingChecklist, setPendingChecklist] = useState<string[]>([]);

  const preset = source && organizationId ? consultingProjectFromProposal(source,organizationId) : null;
  const [form, setForm] = useState({
    client_id: preset?.client_id ?? clientId ?? "",
    service_type_id: "",
    title: preset?.title ?? "",
    description: preset?.description ?? "",
    stage: "novo" as ProcessStage,
    priority: "media" as PriorityLevel,
    due_date: "",
    value: "",
    owner_name: "",
  });
  const initialForm = useMemo(
    () => ({
      client_id: preset?.client_id ?? clientId ?? "",
      service_type_id: "",
      title: preset?.title ?? "",
      description: preset?.description ?? "",
      stage: "novo" as ProcessStage,
      priority: "media" as PriorityLevel,
      due_date: "",
      value: "",
      owner_name: displayName ?? "",
    }),
    [clientId, displayName, preset?.client_id, preset?.title, preset?.description],
  );
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm) || (isConsulting && pendingChecklist.length>0);
  const markSaved = useUnsavedChanges(isDirty);

  useEffect(() => {
    if (displayName && !form.owner_name)
      setForm((current) => ({ ...current, owner_name: displayName }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  const activeTypes = (serviceTypes.data ?? []).filter((type) => type.is_active);

  const applyServiceType = (id: string) => {
    const type = activeTypes.find((item) => item.id === id);
    const checklist = Array.isArray(type?.default_checklist)
      ? (type?.default_checklist as string[])
      : [];
    if(!isConsulting || pendingChecklist.length===0) setPendingChecklist(
      checklist.filter((item) => typeof item === "string" && item.trim().length > 0),
    );
    setForm((current) => ({
      ...current,
      service_type_id: id,
      title: current.title || (type?.name ?? ""),
      due_date: current.due_date || (type?.default_days ? addDays(type.default_days) : ""),
      value: current.value || (type?.default_value != null ? String(type.default_value) : ""),
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId || submitLock.current) return;
    if (!form.client_id) {
      toast.error("Selecione o cliente do processo.");
      return;
    }
    if(source && form.client_id!==consultingSourceClient(source)){toast.error(t("consultingSource.invalid"));return;}
    if(isConsulting && !consultingProjectValid(form)){toast.error("Informe um objetivo de 3 a 160 caracteres e confira o prazo do projeto.");return;}
    if(isConsulting && !consultingDraftDeliveriesValid(pendingChecklist)){toast.error(t("consultingTemplates.invalidDeliveries"));return;}
    submitLock.current=true;
    setSubmitting(true);
    try {
      const titles=isConsulting ? consultingDraftDeliveries(pendingChecklist) : pendingChecklist;
      const {created,deliveriesConfirmed}=await createProjectWithSuggestedDeliveries(()=>createProcess.mutateAsync({
        ...(source ? {source_commercial_proposal_id:source.id} : {}),
        client_id: form.client_id,
        service_type_id: form.service_type_id || null,
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        stage: form.stage,
        priority: form.priority,
        owner_name: form.owner_name.trim() || displayName,
        due_date: form.due_date || null,
        value: form.value ? Number(form.value.replace(",", ".")) : 0,
        financial_status: "nao_aplicavel",
      }), (processId,titles)=>seedChecklist.mutateAsync({processId,titles}),titles);
      if(deliveriesConfirmed)toast.success(`${isConsulting ? "Projeto" : "Processo"} ${created.code} criado.`);
      else toast.warning(isConsulting ? t("consultingTemplates.partial",{code:created.code}) : "Processo criado, mas não foi possível confirmar os itens sugeridos. Confira o checklist na ficha antes de repetir.");
      markSaved();
      navigate({ to: "/processos/$processId", params: { processId: created.id } });
    } catch (error) {
      toast.error(describeError(error, "processo"));
    } finally {
      submitLock.current=false;
      setSubmitting(false);
    }
  };

  if (!permissions.canCreate) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Seu perfil tem acesso somente de leitura e não pode abrir processos.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-violet-400/15 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-violet-400 text-slate-950 shadow-lg shadow-violet-400/20">
            <BriefcaseBusiness className="size-5.5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-violet-300 uppercase">
              Novo fluxo operacional
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{isConsulting ? "Novo projeto" : "Novo processo"}</h1>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <p className="max-w-2xl text-sm leading-6 text-slate-300">
            Defina cliente, serviço, prazo e responsável. O número interno será gerado ao salvar.
          </p>
          {isDirty && (
            <Badge className="border-white/15 bg-white/[0.06] text-white" variant="outline">
              Alterações não salvas
            </Badge>
          )}
        </div>
      </header>
      {source && <ConsultingProposalSourceCard source={source} review/>}
      {isConsulting && <ConsultingTemplatePicker disabled={submitting} hasContent={Boolean(form.title.trim()||form.description.trim()||pendingChecklist.length||form.stage!=="novo")} onApply={(draft)=>{
        const next=applyConsultingTemplate(form,draft);
        setForm(next.form);
        setPendingChecklist(next.deliveries);
      }} />}
      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardContent className="p-4 sm:p-6 lg:p-7">
          <div className="mb-6">
            <p className="text-sm font-semibold">{isConsulting ? t("consultingTemplates.projectInfo") : "Informações do processo"}</p>
            <p className="helper-text mt-1">
              {isConsulting ? t("consultingTemplates.serviceHint") : "O tipo de serviço pode sugerir prazo, valor e checklist automaticamente."}
            </p>
          </div>

          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <fieldset className="contents" disabled={submitting}>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Cliente</Label>
              <Select
                value={form.client_id}
                disabled={Boolean(source)}
                onValueChange={(value) => setForm({ ...form, client_id: value })}
              >
                <SelectTrigger className="h-10 rounded-xl" aria-label="Cliente do processo">
                  <SelectValue
                    placeholder={clients.isLoading ? "Carregando…" : "Selecione o cliente"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(sourceClient ? [sourceClient] : clients.data ?? []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de serviço</Label>
              <Select value={form.service_type_id} onValueChange={applyServiceType}>
                <SelectTrigger className="h-10 rounded-xl" aria-label="Tipo de serviço">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isConsulting && pendingChecklist.length > 0 && (
                <p className="helper-text">
                  {pendingChecklist.length} itens de checklist sugeridos serão criados com o
                  processo.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">{isConsulting ? "Objetivo / nome do projeto" : "Título"}</Label>
              <Input
                id="title"
                maxLength={160}
                required={isConsulting}
                minLength={isConsulting ? 3 : undefined}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Etapa inicial</Label>
              <Select
                value={form.stage}
                onValueChange={(value) => setForm({ ...form, stage: value as ProcessStage })}
              >
                <SelectTrigger className="h-10 rounded-xl" aria-label="Etapa inicial">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {processStageDefinitions(isConsulting ? "consulting_services" : null)[stage].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={form.priority}
                onValueChange={(value) => setForm({ ...form, priority: value as PriorityLevel })}
              >
                <SelectTrigger className="h-10 rounded-xl" aria-label="Prioridade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due">Prazo</Label>
              <Input
                id="due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner">Responsável</Label>
              <Input
                id="owner"
                maxLength={120}
                value={form.owner_name}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="value">Valor (R$)</Label>
              <Input
                id="value"
                inputMode="decimal"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">{isConsulting ? "Escopo combinado" : "Descrição"}</Label>
              <Textarea
                id="description"
                rows={3}
                maxLength={isConsulting ? 4000 : 600}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {isConsulting && <div className="min-w-0 sm:col-span-2"><ConsultingDeliveryDraft titles={pendingChecklist} onChange={setPendingChecklist} disabled={submitting} /></div>}
            <div className="grid gap-2 sm:col-span-2 sm:flex border-t border-border/70 pt-5">
              <Button
                className="w-full sm:w-auto"
                type="submit"
                disabled={submitting || (isConsulting && (!consultingProjectValid(form)||!consultingDraftDeliveriesValid(pendingChecklist)))}
                aria-busy={submitting}
              >
                {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {submitting ? "Criando…" : isConsulting ? "Criar projeto" : "Criar processo"}
              </Button>
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="ghost"
                onClick={() => navigate({ to: "/processos" })}
              >
                Cancelar
              </Button>
            </div>
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
