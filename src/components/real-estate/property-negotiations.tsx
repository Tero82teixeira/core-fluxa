import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace";
import type { PropertyRow } from "@/hooks/use-real-estate";
import type { InterestRow } from "@/lib/real-estate-activity";
import { canWriteProperties } from "@/lib/real-estate";
import {
  usePropertyProposals,
  useProposalHistory,
  useProposalOptions,
  useRecordNegotiation,
} from "@/hooks/use-real-estate-proposals";
import {
  PROPOSAL_STATUSES,
  PROPOSAL_ACTIONS,
  PROPOSAL_PARTIES,
  proposalToday,
  proposalDate,
  proposalValues,
  proposalError,
  type ProposalAction,
  type ProposalRow,
} from "@/lib/real-estate-proposals";
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const money = (value: number) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const options = (values: Record<string, string>) =>
  Object.entries(values).map(([v, l]) => (
    <option key={v} value={v}>
      {l}
    </option>
  ));
type Edit = { proposal: string; request: string; version: number | null; action: ProposalAction };
export function PropertyNegotiations({
  property,
  onClose,
  initialInterest,
}: {
  property: PropertyRow;
  onClose: () => void;
  initialInterest?: InterestRow;
}) {
  const { organizationId, role } = useWorkspace();
  const writable = canWriteProperties(role);
  const closed = !["disponivel", "reservado"].includes(property.status);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ProposalRow | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [edit, setEdit] = useState<Edit | null>(() =>
    initialInterest
      ? {
          proposal: crypto.randomUUID(),
          request: crypto.randomUUID(),
          version: null,
          action: "aberta",
        }
      : null,
  );
  const blank = () => ({
    interest_id: initialInterest?.id || "",
    amount: "",
    terms: "",
    valid_until: proposalToday(),
    party: "interessado" as keyof typeof PROPOSAL_PARTIES,
    note: "",
  });
  const [form, setForm] = useState(blank);
  const query = usePropertyProposals(organizationId, property.id, status, page);
  const history = useProposalHistory(
    organizationId,
    property.id,
    selected?.id || null,
    historyPage,
  );
  const opts = useProposalOptions(organizationId, property.id);
  const save = useRecordNegotiation(organizationId, property.id);
  const decision = edit && ["aceita", "recusada", "cancelada"].includes(edit.action);
  function begin(action: ProposalAction, row?: ProposalRow) {
    save.reset();
    setEdit({
      proposal: row?.id || crypto.randomUUID(),
      request: crypto.randomUUID(),
      version: row?.version ?? null,
      action,
    });
    setForm(
      row
        ? {
            interest_id: row.interest_id,
            amount: String(row.amount).replace(".", ","),
            terms: row.terms,
            valid_until: row.valid_until,
            party: row.party,
            note: "",
          }
        : blank(),
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!edit || save.isPending) return;
    try {
      const values = proposalValues({ ...form, action: edit.action });
      await save.mutateAsync({ ...edit, values });
      toast.success("Negociação registrada no histórico.");
      setEdit(null);
      setSelected(null);
      setPage(1);
    } catch (error) {
      const message =
        error instanceof Error && !("code" in error) ? error.message : proposalError(error);
      toast.error(message);
    }
  }
  const change = (field: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        onEscapeKeyDown={(e) => {
          if (save.isPending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (save.isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {edit
              ? PROPOSAL_ACTIONS[edit.action]
              : selected
                ? "Histórico da negociação"
                : "Propostas e negociações"}
          </DialogTitle>
          <DialogDescription>
            {property.code} — {property.title}. Valores em reais. Validade até o fim do dia de
            Brasília.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          O aceite registra uma decisão interna. Contrato, cobrança e alteração da situação do
          imóvel são etapas separadas.
        </p>
        {edit ? (
          <form onSubmit={submit} className="space-y-4">
            {edit.version === null ? (
              <div className="space-y-1">
                <Label htmlFor="proposal-interest">Interessado e finalidade *</Label>
                <select
                  id="proposal-interest"
                  required
                  className={selectClass}
                  value={form.interest_id}
                  disabled={opts.isPending || opts.isError || save.isPending}
                  onChange={(e) => change("interest_id", e.target.value)}
                >
                  <option value="">Selecione</option>
                  {opts.data?.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.client_name || "Cliente"} — {i.purpose === "venda" ? "Compra" : "Locação"}
                    </option>
                  ))}
                </select>
                {opts.isPending && <p>Carregando interessados…</p>}
                {opts.isError && (
                  <div>
                    <p>{proposalError(opts.error)}</p>
                    <Button type="button" variant="outline" onClick={() => void opts.refetch()}>
                      Tentar novamente
                    </Button>
                  </div>
                )}
                {opts.data?.length === 0 && (
                  <p className="text-sm">
                    Cadastre um interessado ativo em Interessados e visitas antes de criar uma
                    proposta.
                  </p>
                )}
              </div>
            ) : (
              <p>
                {selected?.client_name || initialInterest?.client_name || "Interessado vinculado"}
              </p>
            )}
            <fieldset disabled={Boolean(decision) || save.isPending} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="proposal-amount">Valor proposto (R$) *</Label>
                  <Input
                    id="proposal-amount"
                    required
                    inputMode="decimal"
                    value={form.amount}
                    placeholder="240000,00"
                    onChange={(e) => change("amount", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Em locação, informe o aluguel mensal. Não use separador de milhar.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="proposal-valid">Validade *</Label>
                  <Input
                    id="proposal-valid"
                    required
                    type="date"
                    min={proposalToday()}
                    max="2100-12-31"
                    value={form.valid_until}
                    onChange={(e) => change("valid_until", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="proposal-party">Condições apresentadas por *</Label>
                <select
                  id="proposal-party"
                  className={selectClass}
                  value={form.party}
                  onChange={(e) => change("party", e.target.value)}
                >
                  {options(PROPOSAL_PARTIES)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="proposal-terms">Condições *</Label>
                <Textarea
                  id="proposal-terms"
                  required
                  maxLength={4000}
                  rows={4}
                  value={form.terms}
                  onChange={(e) => change("terms", e.target.value)}
                  placeholder="Forma de pagamento, entrada, financiamento, prazos e outras condições."
                />
              </div>
            </fieldset>
            {decision && (
              <p className="text-sm">
                Esta decisão preserva o valor e as condições da última versão.
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="proposal-note">
                {decision ? "Confirmação ou motivo *" : "Observação"}
              </Label>
              <Textarea
                id="proposal-note"
                required={Boolean(decision)}
                maxLength={4000}
                rows={3}
                disabled={save.isPending}
                value={form.note}
                onChange={(e) => change("note", e.target.value)}
                placeholder={
                  edit.action === "aceita"
                    ? "Registre quem confirmou, quando e por qual meio."
                    : "Descreva o motivo ou contexto."
                }
              />
            </div>
            {save.isError && (
              <p role="alert" className="text-sm text-destructive">
                {proposalError(save.error)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={
                  save.isPending ||
                  !writable ||
                  (edit.version === null &&
                    (closed ||
                      opts.isPending ||
                      opts.isError ||
                      !opts.data?.some((i) => i.id === form.interest_id)))
                }
              >
                {save.isPending ? "Salvando…" : "Registrar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => {
                  setEdit(null);
                  save.reset();
                }}
              >
                Voltar sem salvar
              </Button>
            </div>
          </form>
        ) : selected ? (
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setHistoryPage(1);
              }}
            >
              Voltar às propostas
            </Button>
            <p className="font-medium">
              {selected.client_name || "Cliente"} —{" "}
              {selected.purpose === "venda" ? "Compra" : "Locação"} —{" "}
              {selected.display_status === "vencida"
                ? "Vencida"
                : PROPOSAL_STATUSES[selected.status]}
            </p>
            {writable && (
              <div className="flex flex-wrap gap-2">
                {["aberta", "contraproposta"].includes(selected.status) && (
                  <>
                    <Button
                      variant="outline"
                      disabled={closed}
                      onClick={() => begin("contraproposta", selected)}
                    >
                      Registrar contraproposta
                    </Button>
                    <Button
                      variant="outline"
                      disabled={closed}
                      onClick={() => begin("revisao", selected)}
                    >
                      Atualizar condições
                    </Button>
                    <Button
                      disabled={closed || selected.valid_until < proposalToday()}
                      onClick={() => begin("aceita", selected)}
                    >
                      Registrar aceite
                    </Button>
                    <Button variant="outline" onClick={() => begin("recusada", selected)}>
                      Recusar
                    </Button>
                  </>
                )}
                {["aberta", "contraproposta", "aceita"].includes(selected.status) && (
                  <Button variant="outline" onClick={() => begin("cancelada", selected)}>
                    Cancelar negociação
                  </Button>
                )}
              </div>
            )}
            {selected.status === "aceita" && (
              <p className="text-sm">
                Um cancelamento exige motivo e mantém o aceite anterior no histórico.
              </p>
            )}
            {history.isPending ? (
              <p>Carregando histórico…</p>
            ) : history.isError ? (
              <div>
                <p>{proposalError(history.error)}</p>
                <Button variant="outline" onClick={() => void history.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              history.data?.items.map((e) => (
                <article key={e.id} className="space-y-2 rounded-lg border p-4">
                  <h3 className="font-medium">
                    Versão {e.version} — {PROPOSAL_ACTIONS[e.action]}
                  </h3>
                  <p className="text-sm">
                    {new Date(e.created_at).toLocaleString("pt-BR")} —{" "}
                    {e.actor_name || "Usuário interno"}
                  </p>
                  <p>
                    {money(e.amount)} — validade {proposalDate(e.valid_until)}
                  </p>
                  <p className="text-sm">Condições de: {PROPOSAL_PARTIES[e.party]}</p>
                  <p className="whitespace-pre-wrap break-words">{e.terms}</p>
                  {e.note && (
                    <p className="whitespace-pre-wrap break-words text-sm">Registro: {e.note}</p>
                  )}
                </article>
              ))
            )}
            {(history.data?.total || 0) > 20 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={historyPage === 1 || history.isFetching}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span>Página {historyPage}</span>
                <Button
                  variant="outline"
                  disabled={historyPage * 20 >= (history.data?.total || 0) || history.isFetching}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {writable && (
                <Button disabled={closed} onClick={() => begin("aberta")}>
                  Nova proposta
                </Button>
              )}
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Atualizar
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="proposal-status">Situação</Label>
              <select
                id="proposal-status"
                className={selectClass}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas</option>
                {options(PROPOSAL_STATUSES)}
                <option value="vencida">Vencida</option>
              </select>
            </div>
            {closed && (
              <p className="text-sm">
                Imóvel encerrado: consulte o histórico ou registre recusa/cancelamento de
                negociações existentes.
              </p>
            )}
            {query.isPending ? (
              <p>Carregando propostas…</p>
            ) : query.isError ? (
              <div>
                <p role="alert">{proposalError(query.error)}</p>
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : !query.data?.items.length ? (
              <p>Nenhuma proposta neste filtro.</p>
            ) : (
              query.data.items.map((r) => (
                <article key={r.id} className="space-y-2 rounded-lg border p-4">
                  <h3 className="font-medium">
                    {r.client_name || "Cliente"} — {r.purpose === "venda" ? "Compra" : "Locação"}
                  </h3>
                  <p>
                    {money(r.amount)} —{" "}
                    {r.display_status === "vencida" ? "Vencida" : PROPOSAL_STATUSES[r.status]}
                  </p>
                  <p className="text-sm">
                    Validade: {proposalDate(r.valid_until)} · versão {r.version}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">{r.terms}</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(r);
                      setHistoryPage(1);
                    }}
                  >
                    Abrir negociação e histórico
                  </Button>
                </article>
              ))
            )}
            {(query.data?.total || 0) > 20 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={page === 1 || query.isFetching}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span>
                  Página {page} de {Math.ceil((query.data?.total || 0) / 20)}
                </span>
                <Button
                  variant="outline"
                  disabled={page * 20 >= (query.data?.total || 0) || query.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
