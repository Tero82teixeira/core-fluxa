import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Download, Printer, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReportData } from "@/hooks/use-reports";
import { permissionsForRole } from "@/lib/access-control";
import { useWorkspace } from "@/lib/workspace";
import type { MonitoringAlert } from "@/lib/monitoring";
import { downloadCsv, filterMonitoringReport, groupCount, isInPeriod, isOverdue, monitoringBuckets, monitoringExportRows, monitoringReportMetrics, periodRange, type PeriodPreset } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — FLUXA" }, { name: "description", content: "Indicadores reais da operação." }] }),
  component: ReportsPage,
});

type AnyRow = Record<string, any>;
const COLORS = ["#176b5b", "#28917d", "#d59b36", "#c85b4a", "#66828a", "#7c6ca8"];
const labels: Record<string, string> = { ativo: "Ativo", inativo: "Inativo", pendente: "Pendente", em_andamento: "Em andamento", aguardando: "Aguardando", concluida: "Concluída", cancelada: "Cancelada", baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica", novo: "Novo", em_analise: "Em análise", acompanhado: "Acompanhado", resolvido: "Resolvido", ignorado: "Ignorado", aprovado: "Aprovado" };
const periods: [PeriodPreset, string][] = [["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"], ["90d", "Últimos 90 dias"], ["month", "Este mês"], ["previous_month", "Mês anterior"], ["year", "Este ano"], ["custom", "Período personalizado"]];
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

function ReportsPage() {
  const { organizationId, membership } = useWorkspace();
  const organizationName = membership?.organizations?.trade_name || membership?.organizations?.legal_name || "Organização";
  const canExportReports = permissionsForRole(membership?.role ?? null).canExportReports;
  const report = useReportData(organizationId);
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [client, setClient] = useState("all"); const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState("all"); const [priority, setPriority] = useState("all"); const [processId, setProcessId] = useState("all");
  const [search, setSearch] = useState(""); const [page, setPage] = useState(0);
  const range = useMemo(() => periodRange(period, new Date(), { from, to }), [period, from, to]);
  const data = report.data;
  const filter = (rows: AnyRow[], date = "created_at") => rows.filter((row) =>
    isInPeriod(row[date], range) && (client === "all" || row.client_id === client) &&
    (assignee === "all" || row.assignee_id === assignee || row.owner_id === assignee || row.responsible_user_id === assignee) &&
    (status === "all" || row.status === status || row.stage === status) && (priority === "all" || row.priority === priority) &&
    (processId === "all" || row.process_id === processId || row.id === processId) && !row.archived_at && !row.deleted_at);
  const filtered = useMemo(() => data ? ({ clients: filter(data.clients), tasks: filter(data.tasks), processes: filter(data.processes, "opened_at"), documents: filter(data.documents), monitoring: filterMonitoringReport(data.monitoring, { range, clientId: client, assigneeId: assignee, status, priority, processId }), members: data.members }) : null,
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
  const currentRows = tab === "tasks" ? filtered?.tasks : tab === "processes" ? filtered?.processes : tab === "clients" ? filtered?.clients : tab === "documents" ? filtered?.documents : tab === "monitoring" ? filtered?.monitoring : filtered?.members;

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
      <label className="grid gap-1 text-xs">Tipo de relatório<select className={selectClass} value={tab} onChange={(e) => setTab(e.target.value)}>{[["overview","Visão geral"],["tasks","Tarefas"],["processes","Processos"],["clients","Clientes"],["documents","Documentos"],["monitoring","Monitoramentos"],["team","Equipe"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <Button variant="ghost" className="self-end" onClick={clear}><RefreshCw /> Limpar filtros</Button>
    </CardContent></Card>
    {report.isLoading && <div className="panel p-8 text-center text-muted-foreground">Carregando dados reais…</div>}
    {report.isError && <div role="alert" className="panel p-6 text-destructive"><AlertTriangle className="mr-2 inline" />Não foi possível carregar o relatório. <Button variant="outline" onClick={() => report.refetch()}>Tentar novamente</Button></div>}
    {filtered && <Tabs value={tab} onValueChange={(value) => { setTab(value); setPage(0); }}><TabsList className="no-print flex h-auto flex-wrap justify-start">{[["overview","Visão geral"],["tasks","Tarefas"],["processes","Processos"],["clients","Clientes"],["documents","Documentos"],["monitoring","Monitoramentos"],["team","Equipe"]].map(([v,l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList>
      <TabsContent value="overview" className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label,value]) => <Card key={label}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="metric-value">{value.toLocaleString("pt-BR")}</CardContent></Card>)}</div><div className="grid gap-4 lg:grid-cols-2"><ReportChart title="Tarefas por status" data={taskStatus} pie /><ReportChart title="Processos por etapa" data={processStage} /></div></TabsContent>
      <TabsContent value="tasks"><Section title="Relatório de tarefas" summary={`Média de ${(filtered.tasks.length / Math.max(filtered.members.filter((x: AnyRow)=>x.is_active).length,1)).toLocaleString("pt-BR",{maximumFractionDigits:1})} tarefas por usuário.`} chart={<ReportChart title="Tarefas por prioridade" data={taskPriority} pie />}><DataTable kind="tarefas" rows={filtered.tasks} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="processes"><Section title="Relatório de processos" summary={`${filtered.processes.filter((x: AnyRow) => x.last_movement_at && new Date(x.last_movement_at).getTime() < Date.now()-30*86400000).length} sem movimentação há mais de 30 dias.`} chart={<ReportChart title="Processos por etapa" data={processStage} />}><DataTable kind="processos" rows={filtered.processes} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="clients"><Section title="Relatório de clientes" summary={`${new Set(filtered.processes.map((x: AnyRow)=>x.client_id)).size} clientes com processos; ${filtered.clients.filter((x: AnyRow)=>!filtered.processes.some(p=>p.client_id===x.id)).length} sem processos.`}><DataTable kind="clientes" rows={filtered.clients} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="documents"><Section title="Relatório de documentos" summary={`${filtered.documents.filter((x: AnyRow)=>x.expiration_date && monitoringBuckets(x.expiration_date).expired).length} vencidos.`}><DataTable kind="documentos" rows={filtered.documents} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="monitoring"><Section title="Relatório de monitoramentos" summary={`${filtered.monitoring.filter((x: AnyRow)=>monitoringBuckets(x.relevant_at).in7).length} vencendo em 7 dias; ${filtered.monitoring.filter((x: AnyRow)=>monitoringBuckets(x.relevant_at).in30).length} em 30 dias.`}><DataTable kind="monitoramentos" rows={monitoringExportRows(filtered.monitoring)} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
      <TabsContent value="team"><Section title="Desempenho da equipe" summary="Carga operacional calculada a partir dos vínculos permitidos pelo RLS."><DataTable kind="equipe" rows={filtered.members.map((m: AnyRow)=>({...m,tarefas:filtered.tasks.filter(t=>t.assignee_id===m.user_id).length,concluidas:filtered.tasks.filter(t=>t.assignee_id===m.user_id&&t.status==='concluida').length,atrasadas:filtered.tasks.filter(t=>t.assignee_id===m.user_id&&isOverdue(t.due_at,t.status)).length,processos:filtered.processes.filter(p=>p.owner_id===m.user_id).length}))} search={search} setSearch={setSearch} page={page} setPage={setPage} exportRows={exportRows} canExportReports={canExportReports} /></Section></TabsContent>
    </Tabs>}
  </div>;
}

function Filter({ label, value, set, options }: { label:string; value:string; set:(v:string)=>void; options:any[] }) { return <label className="grid gap-1 text-xs">{label}<select className={selectClass} value={value} onChange={e=>set(e.target.value)}><option value="all">Todos</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>; }
function ReportChart({ title, data, pie=false }: { title:string; data:{name:string;value:number}[]; pie?:boolean }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{!data.length ? <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Sem dados no período.</div> : <div className="h-64" role="img" aria-label={title}><ResponsiveContainer width="100%" height="100%">{pie ? <PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius={85} label>{data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Tooltip /></PieChart> : <BarChart data={data}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" name="Total" fill="#176b5b" radius={[4,4,0,0]}/></BarChart>}</ResponsiveContainer></div>}</CardContent></Card>; }
function Section({ title, summary, chart, children }: { title:string; summary:string; chart?:React.ReactNode; children:React.ReactNode }) { return <div className="space-y-4"><div><h2 className="section-title">{title}</h2><p className="page-subtitle">{summary}</p></div>{chart}{children}</div>; }
function DataTable({ kind, rows, search, setSearch, page, setPage, exportRows, canExportReports }: { kind:string; rows:AnyRow[]; search:string; setSearch:(v:string)=>void; page:number; setPage:(v:number)=>void; exportRows:(k:string,r:AnyRow[])=>void; canExportReports:boolean }) {
  const matching = rows.filter(row=>JSON.stringify(row).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).sort((a,b)=>String(a.title??a.name??a.code??a.created_at).localeCompare(String(b.title??b.name??b.code??b.created_at),"pt-BR")); const shown=matching.slice(page*10,page*10+10); const columns=Array.from(new Set(shown.flatMap(Object.keys))).filter((x: string)=>!["organization_id","deleted_at","archived_at","id","client_id","process_id","assignee_id","owner_id","responsible_user_id","user_id"].includes(x)).slice(0,6);
  return <Card className="table-card"><CardHeader className="no-print flex-row items-center justify-between gap-3"><Input aria-label={`Buscar em ${kind}`} placeholder="Buscar na tabela…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} className="max-w-sm"/>{canExportReports && <Button variant="outline" onClick={()=>exportRows(kind,matching)} disabled={!matching.length}><Download/> Exportar {kind}</Button>}</CardHeader><CardContent className="overflow-x-auto">{!matching.length ? <div className="py-12 text-center text-muted-foreground">Nenhum registro encontrado com os filtros aplicados.</div> : <table className="w-full text-sm"><thead><tr className="border-b">{columns.map(c=><th className="p-2 text-left capitalize" key={c}>{c.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{shown.map((row,i)=><tr className="border-b" key={row.id??i}>{columns.map(c=><td className="max-w-60 truncate p-2" key={c}>{c==="code"&&row.id?<Link className="text-primary underline" to="/processos/$processId" params={{processId:row.id}}>{row[c]}</Link>:formatCell(row[c],c)}</td>)}</tr>)}</tbody></table>}<div className="no-print mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{matching.length} registro(s)</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page===0} onClick={()=>setPage(page-1)}>Anterior</Button><Button size="sm" variant="outline" disabled={(page+1)*10>=matching.length} onClick={()=>setPage(page+1)}>Próxima</Button></div></div></CardContent></Card>;
}
function formatCell(value:any,column:string) { if(value==null)return "—"; if(typeof value==="boolean")return value?"Sim":"Não"; if(column.includes("date")||column.endsWith("_at")){const date=new Date(value);if(!Number.isNaN(date.getTime()))return date.toLocaleDateString("pt-BR");} return labels[value]??String(value).replaceAll("_"," "); }
