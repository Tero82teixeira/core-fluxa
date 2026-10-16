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
import { canWriteProperties } from "@/lib/real-estate";
import { proposalDate, proposalToday } from "@/lib/real-estate-proposals";
import { formatCurrency } from "@/lib/format";
import type { PropertyRow } from "@/hooks/use-real-estate";
import {
  CONTRACT_ACTIONS,
  CONTRACT_STATUSES,
  contractValues,
  contractError,
  type ContractRow,
  type ContractForm,
  type ContractAction,
} from "@/lib/real-estate-contracts";
import {
  usePropertyContracts,
  useContractHistory,
  useContractOptions,
  useRecordContract,
} from "@/hooks/use-real-estate-contracts";
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const blank = (): ContractForm => ({
  reference: "",
  amount: "",
  terms: "",
  starts_on: proposalToday(),
  ends_on: "",
  note: "",
});
type Edit = {
  contract: string;
  property: string;
  proposal: string;
  request: string;
  version: number | null;
  action: ContractAction;
  purpose: "venda" | "locacao";
  previous?: ContractRow;
};
export function PropertyContracts({
  property,
  onClose,
}: {
  property?: PropertyRow;
  onClose: () => void;
}) {
  const { organizationId, role } = useWorkspace();
  const writable = canWriteProperties(role);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ContractRow | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [form, setForm] = useState<ContractForm>(blank);
  const query = usePropertyContracts(organizationId, property?.id || null, status, page);
  const opts = useContractOptions(organizationId, property?.id || null);
  const history = useContractHistory(organizationId, selected, historyPage);
  const save = useRecordContract(organizationId);
  const decision = edit && ["encerrado", "cancelado"].includes(edit.action);
  function begin(action: ContractAction, row?: ContractRow) {
    save.reset();
    setEdit({
      contract: row?.id || crypto.randomUUID(),
      property: row?.property_id || property!.id,
      proposal: row?.proposal_id || "",
      request: crypto.randomUUID(),
      version: row?.version ?? null,
      action,
      purpose: row?.purpose || "venda",
      previous: row,
    });
    setForm(
      row
        ? {
            reference: row.reference,
            amount: String(row.amount).replace(".", ","),
            terms: row.terms,
            starts_on: row.starts_on,
            ends_on: row.ends_on || "",
            note: "",
          }
        : blank(),
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!edit || save.isPending) return;
    try {
      if (!edit.proposal) throw new Error("Selecione uma proposta aceita.");
      const values = contractValues(form, edit.action, edit.purpose, edit.previous);
      await save.mutateAsync({ ...edit, values });
      toast.success("Contrato registrado no histórico.");
      setEdit(null);
      setSelected(null);
      setPage(1);
    } catch (error) {
      toast.error(
        error instanceof Error && !("code" in error) ? error.message : contractError(error),
      );
    }
  }
  function change(field: keyof ContractForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }
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
        onInteractOutside={(e) => {
          if (save.isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Contratos e vencimentos{property ? ` · ${property.code}` : ""}</DialogTitle>
          <DialogDescription>
            Acompanhe venda e locação, renovações e encerramentos. O registro não substitui um
            documento assinado.
          </DialogDescription>
        </DialogHeader>
        {edit ? (
          <form onSubmit={submit} className="space-y-4">
            <h3 className="font-semibold">{CONTRACT_ACTIONS[edit.action]}</h3>
            {edit.action === "criado" && (
              <div className="space-y-1">
                <Label htmlFor="ct-proposal">Proposta aceita *</Label>
                <select
                  id="ct-proposal"
                  className={selectClass}
                  required
                  disabled={save.isPending || opts.isPending || opts.isError}
                  value={edit.proposal}
                  onChange={(e) => {
                    const item = opts.data?.find((p) => p.id === e.target.value);
                    setEdit(
                      (v) =>
                        v && { ...v, proposal: item?.id || "", purpose: item?.purpose || "venda" },
                    );
                    setForm((v) => ({
                      ...v,
                      amount: item ? String(item.amount).replace(".", ",") : "",
                      terms: item?.terms || "",
                    }));
                  }}
                >
                  <option value="">Selecione</option>
                  {opts.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.client_name || "Cliente"} · {p.purpose === "locacao" ? "Locação" : "Venda"}{" "}
                      · {formatCurrency(Number(p.amount))}
                    </option>
                  ))}
                </select>
                {opts.isPending && <p className="text-sm">Carregando propostas…</p>}
                {opts.isError && (
                  <Button type="button" variant="outline" onClick={() => opts.refetch()}>
                    Tentar carregar propostas novamente
                  </Button>
                )}
                {opts.isSuccess && !opts.data.length && (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">
                      Nenhuma proposta disponível para novo contrato.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Esta lista mostra apenas propostas aceitas que ainda não têm contrato.
                      Propostas já vinculadas não aparecem, mesmo quando o contrato foi encerrado ou
                      cancelado. Para uma nova locação, cadastre e aceite outra proposta em
                      Propostas e negociações.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEdit(null);
                        setSelected(null);
                        setStatus("");
                        setPage(1);
                      }}
                    >
                      Ver contratos existentes
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="ct-reference">Referência do contrato *</Label>
              <Input
                id="ct-reference"
                required
                maxLength={60}
                placeholder="CT-001"
                value={form.reference}
                disabled={save.isPending || edit.action !== "criado"}
                onChange={(e) => change("reference", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ct-amount">
                {edit.purpose === "locacao" ? "Aluguel mensal (R$)" : "Valor de venda (R$)"} *
              </Label>
              <Input
                id="ct-amount"
                required
                inputMode="decimal"
                value={form.amount}
                disabled={save.isPending || edit.action !== "renovado"}
                onChange={(e) => change("amount", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ct-terms">Condições *</Label>
              <Textarea
                id="ct-terms"
                required
                maxLength={4000}
                value={form.terms}
                disabled={save.isPending || edit.action !== "renovado"}
                onChange={(e) => change("terms", e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ct-start">Início *</Label>
                <Input
                  id="ct-start"
                  type="date"
                  required
                  min="2000-01-01"
                  max="2100-12-31"
                  value={form.starts_on}
                  disabled={save.isPending || edit.action !== "criado"}
                  onChange={(e) => change("starts_on", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ct-end">
                  Término{edit.purpose === "locacao" ? " *" : " (opcional)"}
                </Label>
                <Input
                  id="ct-end"
                  type="date"
                  required={edit.purpose === "locacao"}
                  min={form.starts_on || "2000-01-01"}
                  max="2100-12-31"
                  value={form.ends_on}
                  disabled={save.isPending || Boolean(decision)}
                  onChange={(e) => change("ends_on", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ct-note">{decision ? "Motivo" : "Confirmação do registro"} *</Label>
              <Textarea
                id="ct-note"
                required
                maxLength={4000}
                value={form.note}
                disabled={save.isPending}
                onChange={(e) => change("note", e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {edit.action === "criado"
                ? "Valor e condições são os da proposta aceita. Confira o documento antes de confirmar."
                : edit.action === "renovado"
                  ? "A renovação preserva o início e registra um término posterior. As condições anteriores permanecem no histórico."
                  : "O encerramento preserva os valores e datas anteriores no histórico."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={save.isPending || (edit.action === "criado" && !edit.proposal)}>
                {save.isPending ? "Registrando…" : "Registrar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => setEdit(null)}
              >
                Voltar
              </Button>
            </div>
          </form>
        ) : selected ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">
                {selected.reference} · {selected.client_name}
              </h3>
              <p>
                {CONTRACT_STATUSES[selected.display_status]} · {selected.property_code} ·{" "}
                {selected.purpose === "locacao" ? "Locação" : "Venda"}
              </p>
              <p>
                {formatCurrency(Number(selected.amount))}
                {selected.purpose === "locacao" ? " / mês" : ""} ·{" "}
                {proposalDate(selected.starts_on)} até{" "}
                {selected.ends_on ? proposalDate(selected.ends_on) : "sem término informado"}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words">{selected.terms}</p>
            </div>
            {writable && selected.status === "ativo" && (
              <div className="flex flex-wrap gap-2">
                {selected.purpose === "locacao" && (
                  <Button onClick={() => begin("renovado", selected)}>Renovar locação</Button>
                )}
                <Button variant="outline" onClick={() => begin("encerrado", selected)}>
                  Encerrar contrato
                </Button>
                <Button variant="outline" onClick={() => begin("cancelado", selected)}>
                  Cancelar contrato
                </Button>
              </div>
            )}
            <h4 className="font-semibold">Histórico</h4>
            {history.isPending ? (
              <p>Carregando histórico…</p>
            ) : history.isError ? (
              <div role="alert">
                <p>Não foi possível carregar o histórico.</p>
                <Button variant="outline" onClick={() => history.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              history.data?.items.map((e) => (
                <article key={e.id} className="space-y-1 rounded-md border p-3">
                  <p className="font-medium">
                    Versão {e.version} · {CONTRACT_ACTIONS[e.action]}
                  </p>
                  <p className="text-sm">
                    {e.actor_name || "Usuário"} ·{" "}
                    {new Date(e.created_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </p>
                  <p>
                    {formatCurrency(Number(e.amount))} · {proposalDate(e.starts_on)} até{" "}
                    {e.ends_on ? proposalDate(e.ends_on) : "sem término"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{e.terms}</p>
                  <p className="whitespace-pre-wrap break-words text-sm">{e.note}</p>
                </article>
              ))
            )}
            {(history.data?.total || 0) > 20 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={historyPage === 1 || history.isFetching}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  Histórico anterior
                </Button>
                <span>Página {historyPage}</span>
                <Button
                  variant="outline"
                  disabled={historyPage * 20 >= (history.data?.total || 0) || history.isFetching}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Mais histórico
                </Button>
              </div>
            )}
            <Button variant="outline" onClick={() => setSelected(null)}>
              Voltar à lista
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-1">
                <Label htmlFor="ct-filter">Situação</Label>
                <select
                  id="ct-filter"
                  className={selectClass}
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Todas</option>
                  {Object.entries(CONTRACT_STATUSES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>
                Atualizar
              </Button>
              {writable && property && ["disponivel", "reservado"].includes(property.status) && (
                <Button onClick={() => begin("criado")}>Registrar contrato</Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Vencimentos usam o dia de Brasília. O último dia ainda está dentro do prazo; após ele,
              aparece Prazo vencido. Renovação e encerramento exigem confirmação.
            </p>
            {!property && (
              <p className="text-sm">
                Para registrar um contrato, abra Contratos e vencimentos no imóvel correspondente.
              </p>
            )}
            {query.isPending ? (
              <p>Carregando contratos…</p>
            ) : query.isError ? (
              <div role="alert">
                <p>Não foi possível carregar os contratos.</p>
                <Button variant="outline" onClick={() => query.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : !query.data?.items.length ? (
              <p>Nenhum contrato nesta situação.</p>
            ) : (
              query.data.items.map((row) => (
                <article key={row.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="font-semibold">
                      {row.reference} · {row.property_code}
                    </h3>
                    <span
                      className={row.display_status === "vencido" ? "text-destructive" : "text-sm"}
                    >
                      {CONTRACT_STATUSES[row.display_status]}
                    </span>
                  </div>
                  <p>
                    {row.client_name || "Cliente"} ·{" "}
                    {row.purpose === "locacao" ? "Locação" : "Venda"}
                  </p>
                  <p>
                    {formatCurrency(Number(row.amount))}
                    {row.purpose === "locacao" ? " / mês" : ""} · Término:{" "}
                    {row.ends_on ? proposalDate(row.ends_on) : "não informado"}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      setSelected(row);
                      setHistoryPage(1);
                    }}
                  >
                    Ver contrato e histórico
                  </Button>
                </article>
              ))
            )}
            {(query.data?.total || 0) > 20 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={page === 1 || query.isFetching}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span>Página {page}</span>
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
