import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, MailPlus, Search, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROLE, TEAM_ROLES, type AppRole } from "@/lib/domain";
import {
  TEAM_MEMBER_LIMIT,
  TEAM_MEMBER_LIMIT_MESSAGE,
  countUsedTeamSeats,
  eligibleTransferTargets,
  hasOpenResponsibilities,
  teamInvitationErrorMessage,
  teamMutationErrorMessage,
} from "@/lib/team-management";
import { usePermissions } from "@/lib/permissions";
import { useWorkspace } from "@/lib/workspace";
import {
  useCancelInvitation,
  useChangeMemberRole,
  useCreateInvitation,
  useInvitations,
  useSetMemberActive,
  useTeamMembers,
  useTransferResponsibilities,
  useUpdateMemberTaskDistribution,
  type TeamMember,
} from "@/hooks/use-team";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — FLUXA" },
      { name: "description", content: "Gestão de usuários, convites e permissões do workspace." },
    ],
  }),
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
  const transferResponsibilities = useTransferResponsibilities(organizationId);
  const updateDistribution = useUpdateMemberTaskDistribution(organizationId);
  const [distributionMember, setDistributionMember] = useState<TeamMember | null>(null);
  const [distributionSector, setDistributionSector] = useState("");
  const [distributionFunction, setDistributionFunction] = useState("");
  const [distributionCapacity, setDistributionCapacity] = useState(20);
  const [distributionEnabled, setDistributionEnabled] = useState(false);
  const [transferFrom, setTransferFrom] = useState<TeamMember | null>(null);
  const [transferToUserId, setTransferToUserId] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("operacional");
  const [lastLink, setLastLink] = useState("");
  const rows = members.data ?? [];
  const pending = (invitations.data ?? []).filter(
    (item) => item.status === "pending" && new Date(item.expires_at) > new Date(),
  );
  const usedSeats = countUsedTeamSeats(rows, pending.length);
  const teamLimitReached = usedSeats >= TEAM_MEMBER_LIMIT;
  const filtered = useMemo(
    () =>
      rows.filter((member) => {
        const term = query.toLocaleLowerCase("pt-BR");
        return (
          (!term ||
            `${member.full_name} ${member.email} ${member.distribution_sector} ${member.distribution_function}`.toLocaleLowerCase("pt-BR").includes(term)) &&
          (roleFilter === "all" || member.role === roleFilter) &&
          (status === "all" || (status === "active") === member.is_active)
        );
      }),
    [query, roleFilter, rows, status],
  );
  const stats = [
    ["Total", rows.length],
    ["Ativos", rows.filter((m) => m.is_active).length],
    ["Inativos", rows.filter((m) => !m.is_active).length],
    ["Convites pendentes", pending.length],
    ["Proprietários", rows.filter((m) => m.role === "proprietario").length],
    ["Administradores", rows.filter((m) => m.role === "administrador").length],
    ["Operacionais", rows.filter((m) => m.role === "operacional").length],
    ["Visualizadores", rows.filter((m) => m.role === "visualizador").length],
  ] as const;
  const transferTargets = transferFrom ? eligibleTransferTargets(rows, transferFrom.user_id) : [];

  function openDistribution(member: TeamMember) {
    setDistributionMember(member);
    setDistributionSector(member.distribution_sector ?? "");
    setDistributionFunction(member.distribution_function ?? "");
    setDistributionCapacity(member.automatic_task_capacity);
    setDistributionEnabled(member.receives_automatic_tasks);
  }

  async function saveDistribution() {
    if (!distributionMember) return;
    if (
      distributionEnabled &&
      (!distributionSector.trim() || !distributionFunction.trim())
    ) {
      toast.error("Informe o setor e a função operacional.");
      return;
    }
    try {
      await updateDistribution.mutateAsync({
        memberId: distributionMember.id,
        sector: distributionSector.trim(),
        operationalFunction: distributionFunction.trim(),
        capacity: distributionCapacity,
        enabled: distributionEnabled,
      });
      toast.success("Distribuição automática atualizada.");
      setDistributionMember(null);
    } catch {
      toast.error("Não foi possível atualizar a distribuição automática.");
    }
  }

  function closeTransferDialog() {
    if (transferResponsibilities.isPending) return;
    setTransferFrom(null);
    setTransferToUserId("");
  }

  async function transfer() {
    if (!transferFrom || !transferTargets.some((member) => member.user_id === transferToUserId))
      return;
    try {
      const result = await transferResponsibilities.mutateAsync({
        fromUserId: transferFrom.user_id,
        toUserId: transferToUserId,
      });
      toast.success(
        `Responsabilidades transferidas: ${result.tasks_moved} tarefas, ${result.processes_moved} processos e ${result.monitoring_moved} monitoramentos.`,
      );
      setTransferFrom(null);
      setTransferToUserId("");
    } catch (error) {
      console.error("Falha ao transferir responsabilidades", error);
      toast.error(teamMutationErrorMessage(error));
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await createInvitation.mutateAsync({ email: email.trim(), role: inviteRole });
      setEmail("");
      setLastLink(result.invitation_url);
      toast.success(
        result.message ||
          (result.email_sent
            ? "Convite enviado."
            : "Convite criado. Configure o serviço de e-mail para envio automático."),
      );
    } catch (error) {
      toast.error(teamInvitationErrorMessage(error));
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="page-title">Equipe</h1>
        <p className="page-subtitle">
          Membros, carga operacional, funções e convites da empresa ativa.
        </p>
      </header>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      {permissions.canInviteMembers && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-muted/30 p-3">
              <div>
                <p className="font-medium">Usuários do plano</p>
                <p className="text-sm text-muted-foreground">
                  Usuários ativos e convites pendentes ocupam uma vaga.
                </p>
              </div>
              <p className="text-sm font-semibold">
                {usedSeats} de {TEAM_MEMBER_LIMIT} vagas usadas
              </p>
            </div>
            {teamLimitReached && (
              <p className="mb-4 text-sm font-medium text-destructive">
                {TEAM_MEMBER_LIMIT_MESSAGE}
              </p>
            )}
            <form onSubmit={invite} className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <div>
                <Label htmlFor="invite-email">E-mail</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pessoa@empresa.com"
                />
              </div>
              <div>
                <Label htmlFor="invite-role">Função</Label>
                <select
                  id="invite-role"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as AppRole)}
                >
                  {TEAM_ROLES.filter(
                    (r) =>
                      r !== "proprietario" && (role === "proprietario" || r !== "administrador"),
                  ).map((r) => (
                    <option value={r} key={r}>
                      {ROLE[r].label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                className="self-end"
                disabled={
                  createInvitation.isPending ||
                  members.isLoading ||
                  invitations.isLoading ||
                  teamLimitReached
                }
              >
                <MailPlus />
                Convidar
              </Button>
            </form>
            {lastLink && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() =>
                  navigator.clipboard.writeText(lastLink).then(() => toast.success("Link copiado."))
                }
              >
                <Copy />
                Copiar link do convite
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label="Buscar por nome ou e-mail"
                placeholder="Buscar nome ou e-mail"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Filtrar função"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">Todas as funções</option>
              {TEAM_ROLES.map((r) => (
                <option value={r} key={r}>
                  {ROLE[r].label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {filtered.map((member) => (
          <Card key={member.id}>
            <CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(180px,1.5fr)_repeat(5,1fr)_auto] md:items-center">
              <div>
                <p className="font-medium">{member.full_name || "Sem nome"}</p>
                <p className="text-sm text-muted-foreground">
                  {member.email || "E-mail indisponível"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Entrada: {date(member.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Função</p>
                <p className="text-sm">{ROLE[member.role].label}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm">{member.is_active ? "Ativo" : "Inativo"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tarefas / processos</p>
                <p className="text-sm">
                  {member.openTasks} / {member.openProcesses}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monitoramentos</p>
                <p className="text-sm">{member.monitoringItems}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Distribuição automática</p>
                <p className="text-sm">
                  {member.receives_automatic_tasks
                    ? `${member.distribution_sector} · ${member.distribution_function}`
                    : "Desativada"}
                </p>
                {member.receives_automatic_tasks && (
                  <p className="text-xs text-muted-foreground">
                    {member.openTasks}/{member.automatic_task_capacity} tarefas
                  </p>
                )}
              </div>
              {permissions.canManageTeam && (
                <Button size="sm" variant="secondary" onClick={() => openDistribution(member)}>
                  Configurar distribuição
                </Button>
              )}
              {permissions.canManageTeam && member.user_id !== user?.id && (
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label={`Alterar função de ${member.full_name}`}
                    className="h-9 rounded-md border bg-background px-2 text-xs"
                    value={member.role}
                    onChange={async (e) => {
                      if (!confirm("Confirma a alteração de função?")) return;
                      try {
                        await changeRole.mutateAsync({
                          memberId: member.id,
                          role: e.target.value as AppRole,
                        });
                        toast.success("Função alterada.");
                      } catch {
                        toast.error("Alteração não permitida.");
                      }
                    }}
                  >
                    {TEAM_ROLES.filter(
                      (r) =>
                        role === "proprietario" || (r !== "proprietario" && r !== "administrador"),
                    ).map((r) => (
                      <option value={r} key={r}>
                        {ROLE[r].label}
                      </option>
                    ))}
                  </select>
                  {member.is_active && hasOpenResponsibilities(member) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setTransferFrom(member);
                        setTransferToUserId("");
                      }}
                    >
                      Transferir responsabilidades
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!member.is_active && teamLimitReached}
                    title={
                      !member.is_active && teamLimitReached ? TEAM_MEMBER_LIMIT_MESSAGE : undefined
                    }
                    onClick={async () => {
                      if (!confirm(`${member.is_active ? "Desativar" : "Reativar"} este membro?`))
                        return;
                      try {
                        await setActive.mutateAsync({
                          memberId: member.id,
                          active: !member.is_active,
                        });
                        toast.success("Status atualizado.");
                      } catch (error) {
                        console.error("Falha ao atualizar status do membro", error);
                        toast.error(teamMutationErrorMessage(error));
                      }
                    }}
                  >
                    {member.is_active ? "Desativar" : "Reativar"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog
        open={Boolean(distributionMember)}
        onOpenChange={(open) => {
          if (!open && !updateDistribution.isPending) setDistributionMember(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Distribuição automática de tarefas</DialogTitle>
            <DialogDescription>
              Defina setor, função operacional e o limite de tarefas abertas. Somente regras
              configuradas com esses mesmos critérios poderão selecionar este membro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="distribution-sector">Setor</Label>
              <Input
                id="distribution-sector"
                maxLength={80}
                value={distributionSector}
                onChange={(event) => setDistributionSector(event.target.value)}
                placeholder="Ex.: Jurídico"
              />
            </div>
            <div>
              <Label htmlFor="distribution-function">Função operacional</Label>
              <Input
                id="distribution-function"
                maxLength={80}
                value={distributionFunction}
                onChange={(event) => setDistributionFunction(event.target.value)}
                placeholder="Ex.: Analista"
              />
            </div>
            <div>
              <Label htmlFor="distribution-capacity">Capacidade de tarefas abertas</Label>
              <Input
                id="distribution-capacity"
                type="number"
                min={1}
                max={500}
                value={distributionCapacity}
                onChange={(event) => setDistributionCapacity(Number(event.target.value))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={distributionEnabled}
                onChange={(event) => setDistributionEnabled(event.target.checked)}
              />
              Receber tarefas distribuídas automaticamente
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDistributionMember(null)}
              disabled={updateDistribution.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={saveDistribution}
              disabled={
                updateDistribution.isPending ||
                !Number.isInteger(distributionCapacity) ||
                distributionCapacity < 1 ||
                distributionCapacity > 500
              }
            >
              Salvar configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(transferFrom)}
        onOpenChange={(open) => {
          if (!open) closeTransferDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir responsabilidades</DialogTitle>
            <DialogDescription>
              Transfira as responsabilidades abertas antes de desativar o membro. A desativação
              deverá ser confirmada separadamente.
            </DialogDescription>
          </DialogHeader>
          {transferFrom && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Membro de origem</p>
                <p className="font-medium">
                  {transferFrom.full_name || transferFrom.email || "Sem nome"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {transferFrom.openTasks} tarefas · {transferFrom.openProcesses} processos ·{" "}
                  {transferFrom.monitoringItems} monitoramentos
                </p>
              </div>
              <div>
                <Label htmlFor="transfer-destination">Membro de destino ativo</Label>
                <select
                  id="transfer-destination"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={transferToUserId}
                  onChange={(event) => setTransferToUserId(event.target.value)}
                >
                  <option value="">Selecione outro membro</option>
                  {transferTargets.map((target) => (
                    <option key={target.id} value={target.user_id}>
                      {target.full_name || target.email || "Sem nome"}
                    </option>
                  ))}
                </select>
                {transferTargets.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Não há outro membro ativo disponível como destino.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeTransferDialog}
              disabled={transferResponsibilities.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={transfer}
              disabled={!transferToUserId || transferResponsibilities.isPending}
            >
              {transferResponsibilities.isPending ? "Transferindo..." : "Confirmar transferência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {pending.length > 0 && (
        <section>
          <h2 className="section-title mb-3">Convites pendentes</h2>
          <div className="space-y-2">
            {pending.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{item.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {ROLE[item.role].label} · expira em {date(item.expires_at)}
                    </p>
                  </div>
                  {permissions.canInviteMembers && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        cancelInvitation
                          .mutateAsync(item.id)
                          .then(() => toast.success("Convite cancelado."))
                      }
                    >
                      Cancelar convite
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
      {!members.isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="grid place-items-center gap-2 p-10 text-center text-muted-foreground">
            <UsersRound />
            <p>Nenhum membro encontrado.</p>
          </CardContent>
        </Card>
      )}
      {!permissions.canManageTeam && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" />
          Você pode consultar a equipe, mas alterações exigem Proprietário ou Administrador.
        </p>
      )}
    </div>
  );
}
