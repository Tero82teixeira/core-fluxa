import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";
import { useSession } from "@/hooks/use-session";
import {
  useOrganizationSettings,
  useUpdateOrganizationSettings,
} from "@/hooks/use-organization-settings";
import {
  ORGANIZATION_SETTINGS_DEFAULTS,
  formatOptionalDate,
  getRoleLabel,
  validateOrganizationSettings,
  type OrganizationSettings,
} from "@/lib/organization-settings";
import { ROLE } from "@/lib/domain";
import { describeError } from "@/lib/errors";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — FLUXA" },
      { name: "description", content: "Central de Administração da organização." },
    ],
  }),
  component: SettingsPage,
});

const tabs = [
  ["geral", "Geral"],
  ["organizacao", "Organização"],
  ["preferencias", "Preferências"],
  ["operacao", "Operação"],
  ["financeiro", "Financeiro"],
  ["comunicacao", "Comunicação"],
  ["monitoramento", "Monitoramento"],
  ["notificacoes", "Notificações"],
  ["seguranca", "Segurança"],
] as const;
const sensitiveRoles = new Set(["superadmin", "proprietario", "administrador"]);
const LOCKED_REGIONAL_KEYS = ["timezone", "locale", "date_format", "currency"] as const;

type Draft = Partial<OrganizationSettings>;
function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  readOnly = false,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange?: (value: string) => void;
  type?: string;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const id = `setting-${label.toLowerCase().replace(/\W/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value ?? ""}
        disabled={disabled}
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        onChange={(e) => onChange?.(e.target.value)}
        className={readOnly ? "cursor-default bg-muted/40 text-foreground" : undefined}
      />
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
function SettingSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = `setting-${label.toLowerCase().replace(/\W/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function SettingsPage() {
  const { organizationId, role } = useWorkspace();
  const { session } = useSession();
  const query = useOrganizationSettings(organizationId);
  const update = useUpdateOrganizationSettings(organizationId);
  const [draft, setDraft] = useState<Draft>({});
  const canEdit = Boolean(role && sensitiveRoles.has(role));
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const dirty = useMemo(
    () => Boolean(query.data && JSON.stringify(draft) !== JSON.stringify(query.data)),
    [draft, query.data],
  );
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const errors = validateOrganizationSettings(draft);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    try {
      const payload = {
        ...draft,
        recent_audit: undefined,
        member_count: undefined,
        client_count: undefined,
        active_process_count: undefined,
        created_at: undefined,
        updated_at: undefined,
        organization_id: undefined,
      };
      for (const key of LOCKED_REGIONAL_KEYS) delete payload[key];
      await update.mutateAsync(payload);
      toast.success("Configurações atualizadas com segurança.");
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };
  if (query.isLoading)
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="mx-auto max-w-6xl p-6">
        <Card>
          <CardContent className="p-6">
            Não foi possível carregar as configurações da organização.
          </CardContent>
        </Card>
      </div>
    );
  const d = draft as OrganizationSettings;
  const notify =
    d.notification_preferences ?? ORGANIZATION_SETTINGS_DEFAULTS.notification_preferences;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-subtitle">
            Central de Administração de {d.trade_name || d.legal_name}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="outline">Alterações não salvas</Badge>}
          <Button onClick={save} disabled={!canEdit || !dirty || update.isPending}>
            <Save className="size-4" />
            {update.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </header>
      {!canEdit && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Lock className="size-4" />
            Seu papel possui acesso somente para leitura. As permissões também são verificadas no
            banco.
          </CardContent>
        </Card>
      )}
      <Tabs defaultValue="geral">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          {tabs.map(([key, label]) => (
            <TabsTrigger key={key} value={key}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="geral">
          <Section title="Resumo da organização">
            <div className="sm:col-span-2 flex items-center gap-3">
              <Building2 className="size-8 text-primary" />
              <div>
                <p className="font-semibold">{d.trade_name || d.legal_name}</p>
                <Badge variant="secondary">Ativa</Badge>
              </div>
            </div>
            <Field label="Membros ativos" value={d.member_count} onChange={() => {}} disabled />
            <Field label="Clientes" value={d.client_count} onChange={() => {}} disabled />
            <Field
              label="Processos ativos"
              value={d.active_process_count}
              onChange={() => {}}
              disabled
            />
            <Field
              label="Criada em"
              value={formatOptionalDate(d.created_at)}
              onChange={() => {}}
              disabled
            />
          </Section>
        </TabsContent>
        <TabsContent value="organizacao">
          <Section title="Dados institucionais">
            <Field
              label="Nome da organização"
              value={d.legal_name}
              disabled={!canEdit}
              onChange={(v) => set("legal_name", v)}
            />
            <Field
              label="Nome de exibição"
              value={d.trade_name}
              disabled={!canEdit}
              onChange={(v) => set("trade_name", v)}
            />
            <Field
              label="CNPJ / identificador fiscal"
              value={d.document}
              onChange={() => {}}
              disabled
            />
            <Field
              label="Telefone"
              value={d.phone}
              disabled={!canEdit}
              onChange={(v) => set("phone", v)}
            />
            <Field
              label="E-mail institucional"
              type="email"
              value={d.email}
              disabled={!canEdit}
              onChange={(v) => set("email", v)}
            />
            <Field
              label="Site"
              type="url"
              value={d.website}
              disabled={!canEdit}
              onChange={(v) => set("website", v)}
            />
            <Field
              label="Endereço"
              value={d.street}
              disabled={!canEdit}
              onChange={(v) => set("street", v)}
            />
            <Field
              label="Número"
              value={d.number}
              disabled={!canEdit}
              onChange={(v) => set("number", v)}
            />
            <Field
              label="Cidade"
              value={d.city}
              disabled={!canEdit}
              onChange={(v) => set("city", v)}
            />
            <Field
              label="Estado"
              value={d.state}
              disabled={!canEdit}
              onChange={(v) => set("state", v)}
            />
            <Field
              label="CEP"
              value={d.zip_code}
              disabled={!canEdit}
              onChange={(v) => set("zip_code", v)}
            />
          </Section>
        </TabsContent>
        <TabsContent value="preferencias">
          <Section title="Preferências regionais">
            <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Fuso horário, idioma, formato de data e moeda são padrões protegidos da FLUXA e
                ficam disponíveis somente para visualização.
              </p>
            </div>
            <Field label="Fuso horário" value={d.timezone} readOnly />
            <Field label="Idioma" value={d.locale} readOnly />
            <Field label="Formato de data" value={d.date_format} readOnly />
            <Field label="Moeda" value={d.currency} readOnly />
            <Field
              label="Primeiro dia da semana (0–6)"
              type="number"
              value={d.week_starts_on}
              disabled={!canEdit}
              onChange={(v) => set("week_starts_on", Number(v))}
            />
            <Field
              label="Início do expediente"
              type="time"
              value={d.business_hours_start}
              disabled={!canEdit}
              onChange={(v) => set("business_hours_start", v)}
            />
            <Field
              label="Fim do expediente"
              type="time"
              value={d.business_hours_end}
              disabled={!canEdit}
              onChange={(v) => set("business_hours_end", v)}
            />
            <Button
              variant="outline"
              disabled={!canEdit}
              onClick={() =>
                setDraft((current) => ({ ...current, ...ORGANIZATION_SETTINGS_DEFAULTS }))
              }
            >
              Restaurar valores padrão
            </Button>
          </Section>
        </TabsContent>
        <TabsContent value="operacao">
          <Section title="Padrões operacionais">
            <Field
              label="Prazo padrão de tarefa (dias)"
              type="number"
              value={d.default_task_due_days}
              disabled={!canEdit}
              onChange={(v) => set("default_task_due_days", Number(v))}
            />
            <Field
              label="Prioridade padrão"
              value={d.default_task_priority}
              disabled={!canEdit}
              onChange={(v) =>
                set("default_task_priority", v as OrganizationSettings["default_task_priority"])
              }
            />
            <Field
              label="Tarefa sem movimentação (dias)"
              type="number"
              value={d.stale_task_days}
              disabled={!canEdit}
              onChange={(v) => set("stale_task_days", Number(v))}
            />
            <Field
              label="Processo sem movimentação (dias)"
              type="number"
              value={d.stale_process_days}
              disabled={!canEdit}
              onChange={(v) => set("stale_process_days", Number(v))}
            />
            <Toggle
              label="Concluir tarefa vencida sem justificativa"
              checked={d.allow_overdue_task_without_reason}
              disabled={!canEdit}
              onChange={(v) => set("allow_overdue_task_without_reason", v)}
            />
          </Section>
        </TabsContent>
        <TabsContent value="financeiro">
          <Section title="Padrões financeiros">
            <Field label="Moeda padrão" value={d.currency} readOnly />
            <Field
              label="Antecedência de alertas (dias)"
              type="number"
              value={d.financial_alert_days}
              disabled={!canEdit}
              onChange={(v) => set("financial_alert_days", Number(v))}
            />
            <Field
              label="Limite de prioridade alta"
              type="number"
              value={d.monitoring_financial_high_threshold}
              disabled={!canEdit}
              onChange={(v) => set("monitoring_financial_high_threshold", Number(v))}
            />
            <Field
              label="Limite de prioridade crítica"
              type="number"
              value={d.monitoring_financial_critical_threshold}
              disabled={!canEdit}
              onChange={(v) => set("monitoring_financial_critical_threshold", Number(v))}
            />
          </Section>
        </TabsContent>
        <TabsContent value="comunicacao">
          <Section title="Preferências internas de comunicação">
            <SettingSelect
              label="Canal padrão"
              value={d.default_communication_channel}
              options={[
                ["interno", "Interno"],
                ["whatsapp", "WhatsApp"],
                ["telefone", "Telefone"],
                ["email", "E-mail"],
                ["presencial", "Presencial"],
                ["outro", "Outro"],
              ]}
              disabled={!canEdit}
              onChange={(v) =>
                set(
                  "default_communication_channel",
                  v as OrganizationSettings["default_communication_channel"],
                )
              }
            />
            <SettingSelect
              label="Prioridade padrão"
              value={d.default_communication_priority}
              options={[
                ["baixa", "Baixa"],
                ["normal", "Normal"],
                ["alta", "Alta"],
                ["urgente", "Urgente"],
              ]}
              disabled={!canEdit}
              onChange={(v) =>
                set(
                  "default_communication_priority",
                  v as OrganizationSettings["default_communication_priority"],
                )
              }
            />
            <Field
              label="Prazo de retorno (horas)"
              type="number"
              value={d.default_follow_up_hours}
              disabled={!canEdit}
              onChange={(v) => set("default_follow_up_hours", Number(v))}
            />
            <Toggle
              label="Destacar notas internas"
              checked={d.highlight_internal_notes}
              disabled={!canEdit}
              onChange={(v) => set("highlight_internal_notes", v)}
            />
          </Section>
        </TabsContent>
        <TabsContent value="monitoramento">
          <Section title="Janelas e alertas">
            <Field
              label="Sem movimentação (dias)"
              type="number"
              value={d.stale_process_days}
              disabled={!canEdit}
              onChange={(v) => set("stale_process_days", Number(v))}
            />
            <Field
              label="Alertas próximos (dias)"
              type="number"
              value={d.monitoring_upcoming_days}
              disabled={!canEdit}
              onChange={(v) => set("monitoring_upcoming_days", Number(v))}
            />
            <Field
              label="Documentos vencendo (dias)"
              type="number"
              value={d.monitoring_document_expiration_days}
              disabled={!canEdit}
              onChange={(v) => set("monitoring_document_expiration_days", Number(v))}
            />
            <Toggle
              label="Alertas financeiros"
              checked={d.monitoring_show_financial}
              disabled={!canEdit}
              onChange={(v) => set("monitoring_show_financial", v)}
            />
            <Toggle
              label="Alertas de comunicação"
              checked={d.monitoring_show_communication}
              disabled={!canEdit}
              onChange={(v) => set("monitoring_show_communication", v)}
            />
            <Toggle
              label="Alertas de documentos"
              checked={d.monitoring_show_documents}
              disabled={!canEdit}
              onChange={(v) => set("monitoring_show_documents", v)}
            />
          </Section>
        </TabsContent>
        <TabsContent value="notificacoes">
          <Section title="Notificações internas">
            {[
              ["overdue_tasks", "Tarefas atrasadas"],
              ["stale_tasks", "Tarefas sem movimentação"],
              ["stale_processes", "Processos sem movimentação"],
              ["overdue_communications", "Retornos vencidos"],
              ["portal_sla_alerts", "SLA do Portal do Cliente"],
              ["overdue_accounts", "Contas vencidas"],
              ["expiring_documents", "Documentos vencendo"],
              ["critical_monitoring", "Alertas críticos"],
              ["unassigned_monitoring", "Pendências sem responsável"],
              ["deadline_reminders", "Lembretes antecipados de prazo"],
              ["client_birthdays", "Aniversários de clientes"],
              ["stale_leads", "Leads sem acompanhamento"],
              ["daily_operational_close", "Fechamento operacional diário"],
              ["weekly_productivity_report", "Relatório semanal de produtividade"],
            ].map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={notify[key] ?? true}
                disabled={!canEdit}
                onChange={(v) => set("notification_preferences", { ...notify, [key]: v })}
              />
            ))}
          </Section>
        </TabsContent>
        <TabsContent value="seguranca">
          <Section title="Acesso e auditoria">
            <Field
              label="Sessão atual"
              value={session?.user.email ?? "Sessão autenticada"}
              onChange={() => {}}
              disabled
            />
            <Field
              label="Papel atual"
              value={getRoleLabel(role, ROLE)}
              onChange={() => {}}
              disabled
            />
            <Field label="Membros ativos" value={d.member_count} onChange={() => {}} disabled />
            <Field
              label="Última atualização"
              value={d.updated_at ? formatOptionalDate(d.updated_at, true) : "Ainda não alterada"}
              onChange={() => {}}
              disabled
            />
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium">Auditoria recente</p>
              {(d.recent_audit ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
              ) : (
                <ul className="space-y-2">
                  {(d.recent_audit ?? []).map((a) => (
                    <li key={a.id} className="rounded border p-2 text-sm">
                      {String(a.metadata.key ?? "Configuração")} ·{" "}
                      {formatOptionalDate(a.created_at, true)} ·{" "}
                      {a.actor_name || "Usuário autenticado"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
