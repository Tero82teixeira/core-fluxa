import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Archive, Plus, Target, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CommercialFollowUpDialog } from "@/components/commercial/commercial-follow-up-dialog";
import { CommercialProposalsPanel } from "@/components/reports/commercial-proposals-panel";
import type { CommercialOpportunityInput } from "@/hooks/use-reports";
import { commercialStages, type CommercialFunnelStage, type CommercialPerformance, type MemberCapacityRow } from "@/lib/reports";
import { commercialFollowUpStatusLabel, contactStatusTone, followUpDue, type CommercialFollowUpStatus } from "@/lib/commercial-follow-up";

type Row = Record<string, any>;
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const probabilityByStage: Record<string, number> = { first_contact: 10, qualification: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 };
const localDateTime = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function CommercialOpportunitiesPanel({ organizationId, rows, funnel, performance, clients, members, canEdit, canArchive, save, archive }: {
  organizationId: string; rows: Row[]; funnel: CommercialFunnelStage[]; performance: CommercialPerformance; clients: Row[]; members: Row[]; canEdit: boolean; canArchive: boolean; save: any; archive: any;
}) {
  const empty: CommercialOpportunityInput = { title: "", stage: "first_contact", estimatedValue: 0, probability: 10, clientId: null, ownerId: null, nextActionAt: null, lostReason: null };
  const [form, setForm] = useState<CommercialOpportunityInput>(empty);
  const [editing, setEditing] = useState(false);
  const active = rows.filter((row) => !["won", "lost"].includes(row.stage));
  const pipeline = active.reduce((sum, row) => sum + (Number(row.estimated_value) || 0), 0);
  const weighted = active.reduce((sum, row) => sum + (Number(row.estimated_value) || 0) * (Number(row.probability) || 0) / 100, 0);
  const won = rows.filter((row) => row.stage === "won").reduce((sum, row) => sum + (Number(row.estimated_value) || 0), 0);
  const submit = async () => {
    try {
      await save.mutateAsync(form);
      toast.success(form.id ? "Oportunidade atualizada." : "Oportunidade criada.");
      setForm(empty); setEditing(false);
    } catch { toast.error("Não foi possível salvar a oportunidade. Revise os campos."); }
  };
  const edit = (row: Row) => {
    setForm({ id: row.id, title: row.title, stage: row.stage, estimatedValue: Number(row.estimated_value) || 0, probability: Number(row.probability) || 0, clientId: row.client_id, ownerId: row.owner_id, nextActionAt: localDateTime(row.next_action_at), lostReason: row.lost_reason });
    setEditing(true);
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="section-title">Funil comercial real</h2><p className="page-subtitle">Acompanhe cada oportunidade do primeiro contato ao ganho ou à perda.</p></div>{canEdit && <Button onClick={() => { setForm(empty); setEditing((value) => !value); }}><Plus /> Nova oportunidade</Button>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric icon={<TrendingUp />} label="Pipeline aberto" value={money(pipeline)} detail={`${active.length} oportunidade(s)`}/><Metric icon={<Target />} label="Previsão ponderada" value={money(weighted)} detail="Valor × probabilidade"/><Metric icon={<Users />} label="Ganhos registrados" value={money(won)} detail={`${rows.filter((row) => row.stage === "won").length} oportunidade(s)`}/></div>
    <CommercialProposalsPanel organizationId={organizationId} opportunities={rows} clients={clients} canEdit={canEdit} canCancel={canArchive} />
    <Card className="border-primary/20"><CardHeader><CardTitle className="text-base">Indicadores comerciais</CardTitle><p className="text-xs text-muted-foreground">Conversão e ticket usam negócios encerrados no período selecionado. O tempo por etapa considera todo o histórico registrado das oportunidades exibidas.</p></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CommercialIndicator label="Taxa de conversão" value={performance.winRate === null ? "—" : `${performance.winRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} detail={`${performance.won} ganha(s) de ${performance.closed} encerrada(s)`}/>
        <CommercialIndicator label="Ticket médio ganho" value={money(performance.averageWonTicket)} detail={`${performance.won} oportunidade(s) ganha(s)`}/>
        <CommercialIndicator label="Negócios perdidos" value={String(performance.lost)} detail="Encerrados como perda"/>
        <CommercialIndicator label="Negócios encerrados" value={String(performance.closed)} detail="Ganhos + perdidos"/>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-4"><h3 className="text-sm font-semibold">Tempo médio por etapa</h3><div className="mt-3 space-y-2">{performance.stageDurations.map((row) => <div key={row.stage} className="flex items-center justify-between gap-3 text-sm"><span>{row.label}</span><strong>{row.samples ? `${row.averageDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia(s)` : "Sem histórico"}</strong></div>)}</div></div>
        <div className="rounded-xl border p-4"><h3 className="text-sm font-semibold">Motivos das perdas</h3>{performance.lostReasons.length ? <div className="mt-3 space-y-2">{performance.lostReasons.map((row) => <div key={row.reason} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{row.reason}</span><strong>{row.count}</strong></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">Nenhuma perda registrada no período.</p>}</div>
      </div>
    </CardContent></Card>
    {editing && <Card className="border-primary/30"><CardHeader><CardTitle className="text-base">{form.id ? "Editar oportunidade" : "Nova oportunidade"}</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-xs lg:col-span-2">Título<Input value={form.title} maxLength={180} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
      <label className="grid gap-1 text-xs">Etapa<select className={selectClass} value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value, probability: probabilityByStage[event.target.value] })}>{commercialStages.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-xs">Valor estimado<Input type="number" min={0} step="0.01" value={form.estimatedValue} onChange={(event) => setForm({ ...form, estimatedValue: Number(event.target.value) })}/></label>
      <label className="grid gap-1 text-xs">Probabilidade (%)<Input type="number" min={0} max={100} value={form.probability} onChange={(event) => setForm({ ...form, probability: Number(event.target.value) })}/></label>
      <label className="grid gap-1 text-xs">Cliente<select className={selectClass} value={form.clientId ?? ""} onChange={(event) => setForm({ ...form, clientId: event.target.value || null })}><option value="">Não vinculado</option>{clients.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs">Responsável<select className={selectClass} value={form.ownerId ?? ""} onChange={(event) => setForm({ ...form, ownerId: event.target.value || null })}><option value="">Não definido</option>{members.filter((row) => row.is_active).map((row) => <option key={row.user_id} value={row.user_id}>{row.full_name || row.email || "Membro sem nome"}</option>)}</select></label>
      <label className="grid gap-1 text-xs">Próxima ação<Input type="datetime-local" value={form.nextActionAt ?? ""} onChange={(event) => setForm({ ...form, nextActionAt: event.target.value || null })}/></label>
      {form.stage === "lost" && <label className="grid gap-1 text-xs md:col-span-2">Motivo da perda<Input value={form.lostReason ?? ""} maxLength={500} onChange={(event) => setForm({ ...form, lostReason: event.target.value })}/></label>}
    </div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button><Button onClick={submit} disabled={save.isPending || form.title.trim().length < 3 || (form.stage === "lost" && (form.lostReason?.trim().length ?? 0) < 3)}>{save.isPending ? "Salvando…" : "Salvar oportunidade"}</Button></div></CardContent></Card>}
    <div className="grid gap-3 xl:grid-cols-3">
      {funnel.map((stage) => <Card key={stage.key}><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-base"><span>{stage.label}</span><span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm text-primary">{stage.value}</span></CardTitle><p className="text-xs text-muted-foreground">{money(stage.estimatedValue)}</p></CardHeader><CardContent className="space-y-2">{!stage.value ? <p className="py-5 text-center text-xs text-muted-foreground">Nenhuma oportunidade nesta etapa.</p> : rows.filter((row) => row.stage === stage.key).map((row) => {
        const status = (row.contact_status ?? "not_contacted") as CommercialFollowUpStatus;
        const client = clients.find((candidate) => candidate.id === row.client_id);
        return <div key={row.id} className="rounded-lg border p-3">
          <button className="w-full text-left" onClick={() => canEdit && edit(row)}>
            <strong className="block truncate text-sm">{row.title}</strong>
            <span className="text-xs text-muted-foreground">{money(Number(row.estimated_value) || 0)} · {row.probability}%</span>
            <span className={followUpDue(row.next_action_at) ? "block text-xs font-medium text-destructive" : "block text-xs text-muted-foreground"}>Próxima ação: {row.next_action_at ? new Date(row.next_action_at).toLocaleString("pt-BR") : "não definida"}</span>
          </button>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
            <Badge variant="outline" className={contactStatusTone(status)}>{commercialFollowUpStatusLabel[status]}</Badge>
            <div className="flex items-center gap-1">
              {canEdit && <CommercialFollowUpDialog mode="tenant" organizationId={organizationId} targetId={row.id} title={row.title} currentStatus={status} nextContactAt={row.next_action_at} email={client?.email} whatsapp={client?.whatsapp} phone={client?.phone} compact />}
              {canArchive && <Button size="sm" variant="ghost" aria-label={`Arquivar ${row.title}`} onClick={async () => { try { await archive.mutateAsync(row.id); toast.success("Oportunidade arquivada."); } catch { toast.error("Não foi possível arquivar."); } }}><Archive /></Button>}
            </div>
          </div>
        </div>;
      })}</CardContent></Card>)}
    </div>
  </div>;
}

function CommercialIndicator({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div>;
}

export function TeamCapacityPanel({ rows, canEdit, save }: { rows: MemberCapacityRow[]; canEdit: boolean; save: any }) {
  const overloaded = rows.filter((row) => row.overloaded).length;
  return <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="section-title">Capacidade e desempenho individual</h2><p className="page-subtitle">Carga atual, atrasos e metas mensais de cada integrante.</p></div><Button asChild variant="outline"><Link to="/equipe">Configurar capacidades</Link></Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric icon={<AlertTriangle />} label="Pessoas sobrecarregadas" value={String(overloaded)} detail="Acima da capacidade configurada" danger={overloaded > 0}/><Metric icon={<Users />} label="Equipe ativa" value={String(rows.length)} detail="Integrantes acompanhados"/><Metric icon={<Target />} label="Com meta individual" value={String(rows.filter((row) => row.completedTasksTarget > 0 || row.completedProcessesTarget > 0).length)} detail="No mês atual"/></div>
    <div className="grid gap-3 lg:grid-cols-2">{rows.map((row) => <MemberCard key={row.userId} row={row} canEdit={canEdit} save={save}/>)}</div>
  </div>;
}

function MemberCard({ row, canEdit, save }: { row: MemberCapacityRow; canEdit: boolean; save: any }) {
  const [tasksTarget, setTasksTarget] = useState(String(row.completedTasksTarget));
  const [processesTarget, setProcessesTarget] = useState(String(row.completedProcessesTarget));
  const saveGoals = async () => { try { await save.mutateAsync({ userId: row.userId, goalMonth: new Date().toISOString().slice(0,7), completedTasksTarget: Number(tasksTarget), completedProcessesTarget: Number(processesTarget) }); toast.success(`Metas de ${row.name} salvas.`); } catch { toast.error("Não foi possível salvar as metas individuais."); } };
  return <Card className={row.overloaded ? "border-destructive/40" : ""}><CardHeader className="pb-3"><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base"><span>{row.name}</span><span className={`rounded-full px-2 py-0.5 text-xs ${row.overloaded ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{row.overloaded ? "Sobrecarga" : "Dentro da capacidade"}</span></CardTitle><p className="text-xs text-muted-foreground">{row.role.replaceAll("_", " ")} · {row.activeProcesses} processo(s) ativo(s) · {row.overdueTasks} tarefa(s) atrasada(s)</p></CardHeader><CardContent className="space-y-4"><Capacity label="Tarefas abertas" current={row.openTasks} capacity={row.taskCapacity}/><Capacity label="Conversas abertas" current={row.openCommunications} capacity={row.communicationCapacity}/><div className="grid grid-cols-2 gap-3 border-t pt-3"><label className="grid gap-1 text-xs">Meta de tarefas<Input type="number" min={0} max={100000} value={tasksTarget} disabled={!canEdit || save.isPending} onChange={(event) => setTasksTarget(event.target.value)}/><span>{row.completedTasks} concluída(s)</span></label><label className="grid gap-1 text-xs">Meta de processos<Input type="number" min={0} max={100000} value={processesTarget} disabled={!canEdit || save.isPending} onChange={(event) => setProcessesTarget(event.target.value)}/><span>{row.completedProcesses} concluído(s)</span></label></div>{canEdit && <div className="flex justify-end"><Button size="sm" onClick={saveGoals} disabled={save.isPending}>Salvar metas individuais</Button></div>}</CardContent></Card>;
}

function Capacity({ label, current, capacity }: { label: string; current: number; capacity: number }) { const percentage = Math.min(100, current / Math.max(capacity, 1) * 100); return <div><div className="mb-1 flex justify-between text-xs"><span>{label}</span><strong className={current > capacity ? "text-destructive" : ""}>{current}/{capacity}</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${current > capacity ? "bg-destructive" : "bg-primary"}`} style={{ width: `${percentage}%` }}/></div></div>; }
function Metric({ icon, label, value, detail, danger=false }: { icon: React.ReactNode; label: string; value: string; detail: string; danger?: boolean }) { return <Card className={danger ? "border-destructive/30" : ""}><CardContent className="flex items-start gap-3 pt-6"><div className={`rounded-lg p-2 ${danger ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{icon}</div><div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>; }
