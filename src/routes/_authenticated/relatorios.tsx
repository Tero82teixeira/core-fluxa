import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Download, Printer, RefreshCw, ShieldAlert, Target, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReportData, useSetPerformanceGoals } from "@/hooks/use-reports";
import { permissionsForRole } from "@/lib/access-control";
import { useWorkspace } from "@/lib/workspace";
import type { MonitoringAlert } from "@/lib/monitoring";
import { CommunicationServiceReport } from "@/components/communication/communication-service-report";
import { canAdminCommunication } from "@/lib/communication";
import { businessAgenda, clientLossRisk, clientProcessSummary, commercialFunnel, currentMonthPerformance, downloadCsv, filterMonitoringReport, filterReportRows, groupCount, isOverdue, monitoringBuckets, monitoringExportRows, monitoringReportMetrics, periodRange, type BusinessAgendaItem, type ClientRiskRow, type CommercialFunnelStage, type PeriodPreset } from "@/lib/reports";

type ReportSearch = { tipo?: string };
const REPORT_TYPES = new Set(["overview", "commercial", "risk", "agenda", "goals", "service", "tasks", "processes", "clients", "documents", "monitoring", "team"]);
export const Route = createFileRoute("/_authenticated/relatorios")({
  validateSearch: (search: Record<string, unknown>): ReportSearch => ({
    tipo: typeof search.tipo === "string" && REPORT_TYPES.has(search.tipo) ? search.tipo : undefined,
  }),
  head: () => ({ meta: [{ title: "Relatórios — FLUXA" }, { name: "description", content: "Indicadores reais da operação." }] }),
  component: ReportsPage,
});

type AnyRow = Record<string, any>;
const COLORS = ["#176b5b", "#28917d", "#d59b36", "#c85b4a", "#66828a", "#7c6ca8"];
const labels: Record<string, string> = { lead: "Lead", em_cadastro: "Em cadastro", ativo: "Ativo", com_pendencia: "Com pendência", inativo: "Inativo", arquivado: "Arquivado", pendente: "Pendente", em_andamento: "Em andamento", aguardando: "Aguardando", concluida: "Concluída", cancelada: "Cancelada", baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica", novo: "Novo", aguardando_documentos: "Aguardando documentos", documentos_conferencia: "Documentos em conferência", montagem: "Montagem", pronto_protocolo: "Pronto para protocolo", protocolado: "Protocolado", em_analise: "Em análise", exigencia: "Exigência", deferido: "Deferido", finalizado: "Finalizado", cancelado: "Cancelado", acompanhado: "Acompanhado", resolvido: "Resolvido", ignorado: "Ignorado", aprovado: "Aprovado", rejeitado: "Rejeitado", recebido: "Recebido", vencido: "Vencido" };
const periods: [PeriodPreset, string][] = [["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"], ["90d", "Últimos 90 dias"], ["month", "Este mês"], ["previous_month", "Mês anterior"], ["year", "Este ano"], ["custom", "Período personalizado"]];
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

function ReportsPage() {
  const { tipo: requestedReport } = Route.useSearch();
  const { organizationId, membership } = useWorkspace();
  const organizationName = membership?.organizations?.trade_name || membership?.organizations?.legal_name || "Organização";
  const canExportReports = permissionsForRole(membership?.role ?? null).canExportReports;
  const canViewServiceReport = canAdminCommunication(membership?.role ?? null);
  const reportTabs = [["overview","Visão geral"],["commercial","Funil comercial"],["risk","Risco de perda"],["agenda","Agenda geral"],["goals","Metas"],["service","Atendimento"],["tasks","Tarefas"],["processes","Processos"],["clients","Clientes"],["documents","Documentos"],["monitoring","Monitoramentos"],["team","Equipe"]].filter(([value]) => value !== "service" || canViewServiceReport);
  const report = useReportData(organizationId);
  const setGoals = useSetPerformanceGoals(organizationId);
  const [tab, setTab] = useState(requestedReport && reportTabs.some(([value]) => value === requestedReport) ? requestedReport : "overview");
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [client, setClient] = useState("all"); const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState("all"); const [priority, setPriority] = useState("all"); const [processId, setProcessId] = useState("all");
  const [search, setSearch] = useState(""); const [page, setPage] = useState(0);
  const range = useMemo(() => periodRange(period, new Date(), { from, to }), [period, from, to]);
  const data = report.data;
  const rowFilters = { range, clientId: client, assigneeId: assignee, status, priority, processId };
  const filtered = useMemo(() => data ? ({ clients: filterReportRows(data.clients, rowFilters, { clientKey: "id" }), tasks: filterReportRows(data.tasks, rowFilters, { clientKey: "client_id" }), processes: filterReportRows(data.processes, rowFilters, { clientKey: "client_id", dateKey: "opened_at", processOwnId: true }), documents: filterReportRows(data.documents, rowFilters, { clientKey: "client_id" }), monitoring: filterMonitoringReport(data.monitoring, rowFilters), members: data.members }) : null,
    // filter is intentionally derived from these primitive controls
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, range, client, assignee, status, priority, processId]);
  const now = new Date();
  const metrics = useMemo(() => {
    if (!filtered) return [];
    const inactiveStages = ["finalizado", "arquivado", "cancelado"];
    const monitoringMetrics = monitoringReportMetrics(filtered.monitoring, now);
    return [
      ["Clientes ativos", filtered.clients.filter((x: AnyRow) => x.status === "ativo").length], ["Clientes inativos", filtered.clients.filter((x: AnyRow) => x.status === "inativo").length],
      ["Tarefas em aberto", filtered.tasks.filter((x: AnyRow) => !["concluida", "cancelada", "arquivada"].includes(x.status)).length], ["Tarefas concluídas", filtered.tasks.filter((x: AnyRow) => x.status === "concluida").length],
      ["Tarefas atrasadas", filtered.tasks.filter((x: AnyRow) => isOverdue(x.due_at, x.status, now)).length], ["Processos ativos", filtered.processes.filter((x: AnyRow) => !inactiveStages.includes(x.stage)).length],
      ["Processos concluídos", filtered.processes.filter((x: AnyRow) => ["finalizado", "deferido"].includes(x.stage)).length], ["Documentos pendentes", filtered.documents.filter((x: AnyRow) => x.status === "pendente").length],
      ["Documentos em análise", filtered.documents.filter((x: AnyRow) => x.status === "em_analise").length], ["Monitoramentos ativos", monitoringMetrics.active],
      ["Monitoramentos vencidos", monitoringMetrics.overdue], ["Vencendo em 30 dias", monitoringMetrics.in30],
      ["Membros ativos", filtered.members.filter((x: AnyRow) => x.is_active).length],
    ] as [string, number][];
  }, [filtered]);
  const taskStatus = Object.entries(groupCount(filtered?.tasks ?? [], (x: AnyRow) => labels[x.status] ?? x.status)).map(([name, value]) => ({ name, value }));
  const taskPriority = Object.entries(groupCount(filtered?.tasks ?? [], (x: AnyRow) => labels[x.priority] ?? x.priority)).map(([name, value]) => ({ name, value }));
  const processStage = Object.entries(groupCount(filtered?.processes ?? [], (x: AnyRow) => x.stage)).map(([name, value]) => ({ name: labels[name] ?? name.replaceAll("_", " "), value }));
  const clear = () => { setPeriod("30d"); setFrom(""); setTo(""); setClient("all"); setAssignee("all"); setStatus("all"); setPriority("all"); setProcessId("all"); setSearch(""); setPage(0); };
  const exportRows = (kind: string, rows: AnyRow[]) => {
    if (!canExportReports) return;
    downloadCsv(kind, ((kind === "monitoring" || kind === "monitoramentos") && rows.some((row) => "suggested_priority" in row) ? monitoringExportRows(rows as MonitoringAlert[]) : rows.map(({ organization_id: _organizationId, deleted_at: _deletedAt, archived_at: _archivedAt, ...row }) => row)));
  };
  const clientSummary = filtered ? clientProcessSummary(filtered.clients, filtered.processes) : null;
  const funnel = filtered ? commercialFunnel(filtered.clients, filtered.processes) : [];
  const riskRows = data ? clientLossRisk(
    data.clients.filter((row: AnyRow) => (client === "all" || row.id === client) && (assignee === "all" || row.owner_id === assignee) && (status === "all" || row.status === status)),
    data.tasks,
    data.processes,
    now,
  ) : [];
  const performance = data ? currentMonthPerformance(data.clients, data.tasks, data.processes, data.movements, now) : { newClients: 0, completedTasks: 0, completedProcesses: 0 };
  const agendaData = data ? {
    tasks: data.tasks.filter((row: AnyRow) => (client === "all" || row.client_id === client) && (assignee === "all" || row.assignee_id === assignee) && (status === "all" || row.status === status) && (priority === "all" || row.priority === priority) && (processId === "all" || row.process_id === processId)),
    processes: data.processes.filter((row: AnyRow) => (client === "all" || row.client_id === client) && (assignee === "all" || row.owner_id === assignee) && (status === "all" || row.stage === status) && (priority === "all" || row.priority === priority) && (processId === "all" || row.id === processId)),
    documents: data.documents.filter((row: AnyRow) => (client === "all" || row.client_id === client) && (status === "all" || row.status === status) && (processId === "all" || row.process_id === processId)),
    monitoring: data.monitoring.filter((row: AnyRow) => (client === "all" || row.client_id === client) && (assignee === "all" || row.assigned_to === assignee || row.responsible_id === assignee) && (status === "all" || row.monitoring_status === status) && (priority === "all" || row.priority_override === priority || row.suggested_priority === priority) && (processId === "all" || row.process_id === processId)),
  } : { tasks: [], processes: [], documents: [], monitoring: [] };
  const currentRows = tab === "tasks" ? filtered?.tasks
    : tab === "processes" ? filtered?.processes
    : tab === "clients" ? filtered?.clients
    : tab === "documents" ? filtered?.documents
    : tab === "monitoring" ? filtered?.monitoring
    : tab === "team" ? filtered?.members
    : tab === "commercial" ? funnel
    : tab === "risk" ? riskRows.map((row) => ({ cliente: row.name, risco: row.level === "high" ? "Alto" : row.level === "medium" ? "Médio" : "Baixo", pontos: row.score, motivos: row.reasons.join("; "), responsavel: row.ownerName }))
    : tab === "agenda" ? businessAgenda(agendaData, 30).map((item) => ({ tipo: item.kind, titulo: item.title, data: item.date, situacao: item.timing, responsavel: item.responsible }))
    : tab === "goals" ? [{ mes: now.toISOString().slice(0, 7), novos_clientes: performance.newClients, tarefas_concluidas: performance.completedTasks, processos_concluidos: performance.completedProcesses }]
    : [];

  if (!organizationId) return <div className="p-6"><h1 className="page-title">Relatórios</h1><p className="mt-3 text-muted-foreground">Selecione uma organização ativa para consultar os indicadores.</p></div>;
  return <div className="reports-page mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
    <header className="print-header flex flex-wrap items-start justify-between gap-3"><div><h1 className="page-title">Relatórios</h1><p className="page-subtitle">Indicadores da {organizationName}, protegidos pelas permissões atuais.</p><p className="hidden text-xs print:block">Gerado em {new Date().toLocaleString("pt-BR")} · Período: {range.from.toLocaleDateString("pt-BR")} a {range.to.toLocaleDateString("pt-BR")}</p></div>{canExportReports && <div className="no-print flex gap-2"><Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir / Salvar em PDF</Button><Button onClick={() => exportRows(tab, currentRows ?? [])} disabled={!currentRows?.length}><Download /> Exportar relatório atual</Button></div>}</header>
    <Card className="no-print"><CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-xs">Período<select className={selectClass} value={period} onChange={(e) => setPeriod(e.target.value as PeriodPreset)}>{periods.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {period === "custom" && <><label className="grid gap-1 text-xs">Data inicial<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="grid gap-1 text-xs">Data final<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></>}
      <Filter label="Cliente" value={client} set={setClient} options={(data?.clients ?? []).map((x: AnyRow) => [x.id, x.name])} />
      <Filter label="Responsável" value={assignee} set={setAssignee} options={Array.from(new Map([...(data?.tasks ?? []).filter((x: AnyRow) => x.assignee_id).map((x: AnyRow) => [x.assignee_id, x.assignee_name || "Sem nome"]), ...(data?.monitoring ?? []).flatMap((x: AnyRow) => [[x.assigned_to, x.assigned_name], [x.responsible_id, x.responsible_name]]).filter(([id]: any[]) => id)]).entries())} />
      <Filter label="Status" value={status} set={setStatus} options={Object.entries(labels)} />
      <Filter label="Prioridade" value={priority} set={setPriority} options={[["baixa","Baixa"],["media","Média"],["alta","Alta"],["critica","Crítica"]]} />
      <Filter label="Processo" value={processId} set={setProcessId} options={(data?.processes ?? []).map((x: AnyRow) => [x.id, x.code])} />
      <label className="grid gap-1 text-xs">Tipo de relatório<select className={selectClass} value={tab} onChange={(e) => setTab(e.target.value)}>{reportTabs.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <Button variant="ghost" className="self-end" onClick={clear}><RefreshCw /> Limpar filtros</Button>
    </CardContent></Card>
    {report.isLoading && <div className="panel p-8 text-center text-muted-foreground">Carregando dados reais…</div>}
    {report.isError && <div role="alert" className="panel p-6 text-destructive"><AlertTriangle className="mr-2 inline" />Não foi possível carregar o relatório. <Button variant="outline" onClick={() => report.refetch()}>Tentar novamente</Button></div>}
    {filtered && <Tabs value={tab} onValueChange={(value) => { setTab(value); setPage(0); }}><div className="no-print rounded-xl border border-primary/20 bg-primary/5 p-3 shadow-sm"><p className="mb-2 text-sm font-semibold text-foreground">Escolha o relatório que deseja visualizar</p><TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 bg-background/80 p-1.5">{reportTabs.map(([v,l]) => <TabsTrigger className="px-4 py-2" key={v} value={v}>{l}</TabsTrigger>)}</TabsList></div>
      <TabsContent value="overview" className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label,value]) => <Card key={label}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="metric-value">{value.toLocaleString("pt-BR")}</CardContent></Card>)}</div><div className="grid gap-4 lg:grid-cols-2"><ReportChart title="Tarefas por status" data={taskStatus} pie /><ReportChart title="Processos por etapa" data={processStage} /></div></TabsContent>
      <TabsContent value="commercial"><CommercialFunnelPanel rows={funnel} riskCount={riskRows.length} /></TabsContent>
      <TabsContent value="risk"><LossRiskPanel rows={riskRows} /></TabsContent>
      <TabsContent value="agenda"><BusinessAgendaPanel data={agendaData} /></TabsContent>
      <TabsContent value="goals"><PerformanceGoalsPanel key={organizationId} goals={data!.goals} actual={performance} canEdit={["superadmin","proprietario","administrador","gestor"].includes(membership?.role ?? "")} save={setGoals} /></TabsContent>
      {canViewServiceReport && <TabsContent value="service"><CommunicationServiceReport organizationId={organizationId} from={range.from} to={range.to} /></TabsContent>}
      <TabsContent value="tasks"><Section title="Relatório de tarefas" summary={`Média de ${(filtered.tasks.length / Math.max(filtered.members.filter((x: AnyRow)=>x.is_active).length,1)).toLocaleString("pt-BR",{maximumFractionDigits:1})} tarefas por usuário.`} chart={<ReportChart title="Tarefas por prioridade" data={taskPriority} pie />}><DataTable kind="tarefas" rows={filtered.tasks} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="processes"><Section title="Relatório de processos" summary={`${filtered.processes.filter((x: AnyRow) => x.last_movement_at && new Date(x.last_movement_at).getTime() < Date.now()-30*86400000).length} sem movimentação há mais de 30 dias.`} chart={<ReportChart title="Processos por etapa" data={processStage} />}><DataTable kind="processos" rows={filtered.processes} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="clients"><Section title="Relatório de clientes" summary={`${clientSummary?.withProcesses ?? 0} clientes com processos; ${clientSummary?.withoutProcesses ?? 0} sem processos.`}><DataTable kind="clientes" rows={filtered.clients} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="documents"><Section title="Relatório de documentos" summary={`${filtered.documents.filter((x: AnyRow)=>x.expiration_date && monitoringBuckets(x.expiration_date).expired).length} vencidos.`}><DataTable kind="documentos" rows={filtered.documents} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="monitoring"><Section title="Relatório de monitoramentos" summary={`${filtered.monitoring.filter((x: AnyRow)=>monitoringBuckets(x.relevant_at).in7).length} vencendo em 7 dias; ${filtered.monitoring.filter((x: AnyRow)=>monitoringBuckets(x.relevant_at).in30).length} em 30 dias.`}><DataTable kind="monitoramentos" rows={monitoringExportRows(filtered.monitoring)} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="team"><Section title="Desempenho da equipe" summary="Carga operacional calculada a partir dos vínculos permitidos pelo RLS."><DataTable kind="equipe" rows={filtered.members.map((m: AnyRow)=>({...m,tarefas:filtered.tasks.filter(t=>t.assignee_id===m.user_id).length,concluidas:filtered.tasks.filter(t=>t.assignee_id===m.user_id&&t.status==='concluida').length,atrasadas:filtered.tasks.filter(t=>t.assignee_id===m.user_id&&isOverdue(t.due_at,t.status)).length,processos:filtered.processes.filter(p=>p.owner_id===m.user_id).length}))} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
    </Tabs>}
  </div>;
}

function CommercialFunnelPanel({ rows, riskCount }: { rows: CommercialFunnelStage[]; riskCount: number }) {
  const active = rows.find((row) => row.key === "active")?.value ?? 0;
  const won = rows.find((row) => row.key === "won")?.value ?? 0;
  return <Section title="Funil comercial atual" summary="Fotografia da carteira no período selecionado. Cada etapa usa somente cadastros e processos realmente registrados.">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <InsightCard icon={<TrendingUp />} label="Clientes ativos" value={active} detail="Relacionamentos em andamento" />
      <InsightCard icon={<Target />} label="Com conclusão" value={won} detail="Clientes com processo deferido ou finalizado" />
      <InsightCard icon={<ShieldAlert />} label="Precisam de atenção" value={riskCount} detail="Sinais objetivos na carteira atual" danger={riskCount > 0} />
    </div>
    <ReportChart title="Etapas do funil comercial" data={rows.map((row) => ({ name: row.label, value: row.value }))} />
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
      Este painel não presume conversões históricas: ele mostra quantos registros estão em cada situação agora. Use o período e os filtros acima para analisar recortes específicos.
    </div>
  </Section>;
}

function LossRiskPanel({ rows }: { rows: ClientRiskRow[] }) {
  const high = rows.filter((row) => row.level === "high").length;
  const medium = rows.filter((row) => row.level === "medium").length;
  const low = rows.filter((row) => row.level === "low").length;
  return <Section title="Risco de perda da carteira" summary="Prioridade calculada por pendências, atrasos, falta de contato e processos sem movimentação — sem uso de IA e com os motivos visíveis.">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <InsightCard icon={<ShieldAlert />} label="Risco alto" value={high} detail="Ação imediata recomendada" danger={high > 0} />
      <InsightCard icon={<AlertTriangle />} label="Risco médio" value={medium} detail="Planeje o próximo contato" />
      <InsightCard icon={<TrendingUp />} label="Risco baixo" value={low} detail="Acompanhe preventivamente" />
      <InsightCard icon={<TrendingUp />} label="Total em atenção" value={rows.length} detail="Clientes com ao menos um sinal" />
    </div>
    <Card><CardContent className="pt-6">
      {!rows.length ? <div className="py-10 text-center text-sm text-muted-foreground">Nenhum sinal de risco encontrado na carteira atual.</div> : <div className="space-y-3">{rows.map((row) => <div key={row.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate">{row.name}</strong><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.level === "high" ? "bg-destructive/10 text-destructive" : row.level === "medium" ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary"}`}>{row.score} pontos · {row.level === "high" ? "Alto" : row.level === "medium" ? "Médio" : "Baixo"}</span></div><p className="mt-1 text-sm text-muted-foreground">{row.reasons.join(" · ")}</p><p className="mt-1 text-xs text-muted-foreground">Responsável: {row.ownerName || "Não definido"} · Último contato: {row.lastInteractionAt ? new Date(row.lastInteractionAt).toLocaleDateString("pt-BR") : "não registrado"}</p></div>
        <Button asChild variant="outline"><Link to="/clientes/$clientId" params={{ clientId: row.id }}>Abrir cliente</Link></Button>
      </div>)}</div>}
    </CardContent></Card>
  </Section>;
}

function BusinessAgendaPanel({ data }: { data: { tasks: AnyRow[]; processes: AnyRow[]; documents: AnyRow[]; monitoring: AnyRow[] } }) {
  const [horizon, setHorizon] = useState(30);
  const items = businessAgenda(data, horizon);
  const overdue = items.filter((item) => item.timing === "overdue").length;
  const today = items.filter((item) => item.timing === "today").length;
  return <Section title="Agenda geral da empresa" summary="Tarefas, processos, documentos e monitoramentos reunidos pela data já cadastrada em cada módulo.">
    <div className="no-print max-w-xs"><label className="grid gap-1 text-xs">Horizonte da agenda<select className={selectClass} value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}><option value={7}>Próximos 7 dias + atrasados</option><option value={30}>Próximos 30 dias + atrasados</option><option value={60}>Próximos 60 dias + atrasados</option></select></label></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <InsightCard icon={<AlertTriangle />} label="Atrasados" value={overdue} detail="Itens anteriores a hoje" danger={overdue > 0} />
      <InsightCard icon={<CalendarDays />} label="Para hoje" value={today} detail="Compromissos do dia" />
      <InsightCard icon={<Target />} label="Na agenda" value={items.length} detail={`Até ${horizon} dias, incluindo atrasados`} />
    </div>
    <Card><CardContent className="pt-6">{!items.length ? <div className="py-10 text-center text-sm text-muted-foreground">Nenhum compromisso encontrado neste horizonte.</div> : <div className="divide-y">{items.map((item) => <AgendaRow key={item.id} item={item} />)}</div>}</CardContent></Card>
  </Section>;
}

function AgendaRow({ item }: { item: BusinessAgendaItem }) {
  const kind = { task: "Tarefa", process: "Processo", document: "Documento", monitoring: "Monitoramento" }[item.kind];
  return <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{kind}</span><strong className="truncate">{item.title}</strong></div><p className="mt-1 text-xs text-muted-foreground">{item.responsible || "Sem responsável definido"}</p></div><div className="flex items-center gap-3"><span className={`text-sm font-semibold ${item.timing === "overdue" ? "text-destructive" : "text-foreground"}`}>{item.timing === "overdue" ? "Atrasado · " : item.timing === "today" ? "Hoje · " : ""}{new Date(item.date.length === 10 ? `${item.date}T12:00:00` : item.date).toLocaleDateString("pt-BR")}</span><Button asChild size="sm" variant="outline"><a href={item.route}>Abrir</a></Button></div></div>;
}

function PerformanceGoalsPanel({ goals, actual, canEdit, save }: { goals: AnyRow[]; actual: { newClients: number; completedTasks: number; completedProcesses: number }; canEdit: boolean; save: any }) {
  const month = new Date().toISOString().slice(0, 7);
  const current = goals.find((goal) => goal.goal_month?.slice(0, 7) === month);
  const [targets, setTargets] = useState({ newClients: String(current?.new_clients_target ?? 0), completedTasks: String(current?.completed_tasks_target ?? 0), completedProcesses: String(current?.completed_processes_target ?? 0) });
  const rows = [
    { key: "newClients", label: "Novos clientes", actual: actual.newClients, target: Number(targets.newClients) || 0 },
    { key: "completedTasks", label: "Tarefas concluídas", actual: actual.completedTasks, target: Number(targets.completedTasks) || 0 },
    { key: "completedProcesses", label: "Processos concluídos", actual: actual.completedProcesses, target: Number(targets.completedProcesses) || 0 },
  ];
  const submit = async () => {
    try {
      await save.mutateAsync({ goalMonth: month, newClientsTarget: Number(targets.newClients), completedTasksTarget: Number(targets.completedTasks), completedProcessesTarget: Number(targets.completedProcesses) });
      toast.success("Metas do mês salvas.");
    } catch { toast.error("Não foi possível salvar as metas. Revise os valores e tente novamente."); }
  };
  return <Section title="Metas e desempenho" summary={`Acompanhamento de ${new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}. As metas são opcionais e não alteram os registros operacionais.`}>
    <div className="grid gap-4 lg:grid-cols-3">{rows.map((row) => { const progress = row.target > 0 ? Math.min(100, (row.actual / row.target) * 100) : 0; return <Card key={row.key}><CardHeader className="pb-2"><CardTitle className="text-base">{row.label}</CardTitle></CardHeader><CardContent><div className="flex items-end justify-between"><span className="metric-value">{row.actual}</span><span className="text-sm text-muted-foreground">{row.target > 0 ? `de ${row.target}` : "Meta não definida"}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{row.target > 0 ? `${progress.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% alcançado` : "Defina uma meta abaixo para acompanhar o progresso."}</p></CardContent></Card>; })}</div>
    <Card className="no-print"><CardHeader><CardTitle className="text-base">Definir metas do mês</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3">{rows.map((row) => <label key={row.key} className="grid gap-1 text-xs">{row.label}<Input type="number" min={0} max={100000} value={targets[row.key as keyof typeof targets]} disabled={!canEdit || save.isPending} onChange={(event) => setTargets({ ...targets, [row.key]: event.target.value })} /></label>)}</div><div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Proprietário, administrador e gestor podem atualizar estas metas.</p>{canEdit && <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar metas"}</Button>}</div></CardContent></Card>
  </Section>;
}

function InsightCard({ icon, label, value, detail, danger = false }: { icon: React.ReactNode; label: string; value: number; detail: string; danger?: boolean }) {
  return <Card className={danger ? "border-destructive/30" : ""}><CardContent className="flex items-start gap-3 pt-6"><div className={`rounded-lg p-2 ${danger ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{icon}</div><div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="metric-value">{value.toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>;
}

function Filter({ label, value, set, options }: { label:string; value:string; set:(v:string)=>void; options:any[] }) { return <label className="grid gap-1 text-xs">{label}<select className={selectClass} value={value} onChange={e=>set(e.target.value)}><option value="all">Todos</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>; }
function ReportChart({ title, data, pie=false }: { title:string; data:{name:string;value:number}[]; pie?:boolean }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{!data.length ? <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Sem dados no período.</div> : <div className="h-64" role="img" aria-label={title}><ResponsiveContainer width="100%" height="100%">{pie ? <PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius={85} label>{data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Tooltip /></PieChart> : <BarChart data={data}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" name="Total" fill="#176b5b" radius={[4,4,0,0]}/></BarChart>}</ResponsiveContainer></div>}</CardContent></Card>; }
function Section({ title, summary, chart, children }: { title:string; summary:string; chart?:React.ReactNode; children:React.ReactNode }) { return <div className="space-y-4"><div><h2 className="section-title">{title}</h2><p className="page-subtitle">{summary}</p></div>{chart}{children}</div>; }
function DataTable({ kind, rows, search, setSearch, page, setPage, exportRows, canExportReports }: { kind:string; rows:AnyRow[]; search:string; setSearch:(v:string)=>void; page:number; setPage:(v:number)=>void; exportRows:(k:string,r:AnyRow[])=>void; canExportReports:boolean }) {
  const matching = rows.filter(row=>JSON.stringify(row).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).sort((a,b)=>String(a.title??a.name??a.code??a.created_at).localeCompare(String(b.title??b.name??b.code??b.created_at),"pt-BR")); const shown=matching.slice(page*10,page*10+10); const columns=Array.from(new Set(shown.flatMap(Object.keys))).filter((x: string)=>!["organization_id","deleted_at","archived_at","id","client_id","process_id","assignee_id","owner_id","responsible_user_id","user_id"].includes(x)).slice(0,6);
  return <Card className="table-card"><CardHeader className="no-print flex-row items-center justify-between gap-3"><Input aria-label={`Buscar em ${kind}`} placeholder="Buscar na tabela…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} className="max-w-sm"/>{canExportReports && <Button variant="outline" onClick={()=>exportRows(kind,matching)} disabled={!matching.length}><Download/> Exportar {kind}</Button>}</CardHeader><CardContent className="overflow-x-auto">{!matching.length ? <div className="py-12 text-center text-muted-foreground">Nenhum registro encontrado com os filtros aplicados.</div> : <table className="w-full text-sm"><thead><tr className="border-b">{columns.map(c=><th className="p-2 text-left capitalize" key={c}>{c.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{shown.map((row,i)=><tr className="border-b" key={row.id??i}>{columns.map(c=><td className="max-w-60 truncate p-2" key={c}>{c==="code"&&row.id?<Link className="text-primary underline" to="/processos/$processId" params={{processId:row.id}}>{row[c]}</Link>:formatCell(row[c],c)}</td>)}</tr>)}</tbody></table>}<div className="no-print mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{matching.length} registro(s)</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page===0} onClick={()=>setPage(page-1)}>Anterior</Button><Button size="sm" variant="outline" disabled={(page+1)*10>=matching.length} onClick={()=>setPage(page+1)}>Próxima</Button></div></div></CardContent></Card>;
}
function formatCell(value:any,column:string) { if(value==null)return "—"; if(typeof value==="boolean")return value?"Sim":"Não"; if(column.includes("date")||column.endsWith("_at")){const date=new Date(value);if(!Number.isNaN(date.getTime()))return date.toLocaleDateString("pt-BR");} return labels[value]??String(value).replaceAll("_"," "); }
