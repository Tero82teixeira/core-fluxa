import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, MailPlus, Search, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE, TEAM_ROLES, type AppRole } from "@/lib/domain";
import { usePermissions } from "@/lib/permissions";
import { useWorkspace } from "@/lib/workspace";
import { useCancelInvitation, useChangeMemberRole, useCreateInvitation, useInvitations, useSetMemberActive, useTeamMembers } from "@/hooks/use-team";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({ meta: [{ title: "Equipe — FLUXA" }, { name: "description", content: "Gestão de usuários, convites e permissões do workspace." }] }),
  component: TeamPage,
});

const date = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(value));

function TeamPage() {
  const { organizationId, user, role } = useWorkspace();
  const permissions = usePermissions();
  const members = useTeamMembers(organizationId);
  const invitations = useInvitations(organizationId);
  const createInvitation = useCreateInvitation(organizationId);
  const cancelInvitation = useCancelInvitation(organizationId);
  const changeRole = useChangeMemberRole(organizationId);
  const setActive = useSetMemberActive(organizationId);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("operacional");
  const [lastLink, setLastLink] = useState("");
  const rows = members.data ?? [];
  const pending = (invitations.data ?? []).filter((item) => item.status === "pending" && new Date(item.expires_at) > new Date());
  const filtered = useMemo(() => rows.filter((member) => {
    const term = query.toLocaleLowerCase("pt-BR");
    return (!term || `${member.full_name} ${member.email}`.toLocaleLowerCase("pt-BR").includes(term)) &&
      (roleFilter === "all" || member.role === roleFilter) &&
      (status === "all" || (status === "active") === member.is_active);
  }), [query, roleFilter, rows, status]);
  const stats = [
    ["Total", rows.length], ["Ativos", rows.filter((m) => m.is_active).length], ["Inativos", rows.filter((m) => !m.is_active).length],
    ["Convites pendentes", pending.length], ["Proprietários", rows.filter((m) => m.role === "proprietario").length],
    ["Administradores", rows.filter((m) => m.role === "administrador").length], ["Operacionais", rows.filter((m) => m.role === "operacional").length],
    ["Visualizadores", rows.filter((m) => m.role === "visualizador").length],
  ] as const;

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await createInvitation.mutateAsync({ email: email.trim(), role: inviteRole });
      setEmail(""); setLastLink(result.invitation_url);
      toast.success(result.message || (result.email_sent ? "Convite enviado." : "Convite criado. Configure o serviço de e-mail para envio automático."));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível criar o convite."); }
  }

  return <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
    <header><h1 className="page-title">Equipe</h1><p className="page-subtitle">Membros, carga operacional, funções e convites da empresa ativa.</p></header>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>)}</section>
    {permissions.canInviteMembers && <Card><CardContent className="p-5"><form onSubmit={invite} className="grid gap-3 md:grid-cols-[1fr_220px_auto]"><div><Label htmlFor="invite-email">E-mail</Label><Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" /></div><div><Label htmlFor="invite-role">Função</Label><select id="invite-role" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as AppRole)}>{TEAM_ROLES.filter((r) => r !== "proprietario" && (role === "proprietario" || r !== "administrador")).map((r) => <option value={r} key={r}>{ROLE[r].label}</option>)}</select></div><Button className="self-end" disabled={createInvitation.isPending}><MailPlus />Convidar</Button></form>{lastLink && <Button variant="outline" className="mt-3" onClick={() => navigator.clipboard.writeText(lastLink).then(() => toast.success("Link copiado."))}><Copy />Copiar link do convite</Button>}</CardContent></Card>}
    <Card><CardContent className="p-4"><div className="grid gap-3 md:grid-cols-[1fr_200px_200px]"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" aria-label="Buscar por nome ou e-mail" placeholder="Buscar nome ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select aria-label="Filtrar função" className="h-9 rounded-md border bg-background px-3 text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="all">Todas as funções</option>{TEAM_ROLES.map((r) => <option value={r} key={r}>{ROLE[r].label}</option>)}</select><select aria-label="Filtrar status" className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></div></CardContent></Card>
    <div className="space-y-3">{filtered.map((member) => <Card key={member.id}><CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(180px,1.5fr)_repeat(4,1fr)_auto] md:items-center"><div><p className="font-medium">{member.full_name || "Sem nome"}</p><p className="text-sm text-muted-foreground">{member.email || "E-mail indisponível"}</p><p className="mt-1 text-xs text-muted-foreground">Entrada: {date(member.created_at)}</p></div><div><p className="text-xs text-muted-foreground">Função</p><p className="text-sm">{ROLE[member.role].label}</p></div><div><p className="text-xs text-muted-foreground">Status</p><p className="text-sm">{member.is_active ? "Ativo" : "Inativo"}</p></div><div><p className="text-xs text-muted-foreground">Tarefas / processos</p><p className="text-sm">{member.openTasks} / {member.openProcesses}</p></div><div><p className="text-xs text-muted-foreground">Monitoramentos</p><p className="text-sm">{member.monitoringItems}</p></div>{permissions.canManageTeam && member.user_id !== user?.id && <div className="flex flex-wrap gap-2"><select aria-label={`Alterar função de ${member.full_name}`} className="h-9 rounded-md border bg-background px-2 text-xs" value={member.role} onChange={async (e) => { if (!confirm("Confirma a alteração de função?")) return; try { await changeRole.mutateAsync({ memberId: member.id, role: e.target.value as AppRole }); toast.success("Função alterada."); } catch { toast.error("Alteração não permitida."); } }}>{TEAM_ROLES.filter((r) => role === "proprietario" || (r !== "proprietario" && r !== "administrador")).map((r) => <option value={r} key={r}>{ROLE[r].label}</option>)}</select><Button size="sm" variant="outline" onClick={async () => { if (!confirm(`${member.is_active ? "Desativar" : "Reativar"} este membro?`)) return; try { await setActive.mutateAsync({ memberId: member.id, active: !member.is_active }); toast.success("Status atualizado."); } catch { toast.error("Verifique vínculos e regras de propriedade."); } }}>{member.is_active ? "Desativar" : "Reativar"}</Button></div>}</CardContent></Card>)}</div>
    {pending.length > 0 && <section><h2 className="section-title mb-3">Convites pendentes</h2><div className="space-y-2">{pending.map((item) => <Card key={item.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{item.email}</p><p className="text-sm text-muted-foreground">{ROLE[item.role].label} · expira em {date(item.expires_at)}</p></div>{permissions.canInviteMembers && <Button variant="outline" size="sm" onClick={() => cancelInvitation.mutateAsync(item.id).then(() => toast.success("Convite cancelado."))}>Cancelar convite</Button>}</CardContent></Card>)}</div></section>}
    {!members.isLoading && filtered.length === 0 && <Card><CardContent className="grid place-items-center gap-2 p-10 text-center text-muted-foreground"><UsersRound/><p>Nenhum membro encontrado.</p></CardContent></Card>}
    {!permissions.canManageTeam && <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4"/>Você pode consultar a equipe, mas alterações exigem Proprietário ou Administrador.</p>}
  </div>;
}
