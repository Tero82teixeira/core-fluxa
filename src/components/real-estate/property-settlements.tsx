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
import { formatCurrency } from "@/lib/format";
import { proposalDate, proposalToday } from "@/lib/real-estate-proposals";
import type { PropertyRow } from "@/hooks/use-real-estate";
import {
  SETTLEMENT_STATUSES,
  SETTLEMENT_ACTIONS,
  canWriteSettlements,
  commissionBreakdown,
  settlementValues,
  settlementError,
  type SettlementForm,
  type SettlementRow,
  type SettlementOption,
  type SettlementAction,
} from "@/lib/real-estate-settlements";
import {
  useSettlements,
  useSettlementOptions,
  useSettlementHistory,
  useRecordSettlement,
} from "@/hooks/use-real-estate-settlements";
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const blank = (): SettlementForm => ({
  reference: proposalToday().slice(0, 7),
  gross: "",
  commission_type: "percentual",
  commission_value: "10,00",
  due_on: proposalToday(),
  occurred_on: proposalToday(),
  note: "",
});
type Edit = {
  settlement: string;
  request: string;
  version: number | null;
  action: SettlementAction;
  contract: string;
  property: string;
  owner: string;
  option?: SettlementOption;
};
export function PropertySettlements({
  property,
  onClose,
}: {
  property?: PropertyRow;
  onClose: () => void;
}) {
  const { organizationId, role } = useWorkspace();
  const writable = canWriteSettlements(role);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SettlementRow | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [form, setForm] = useState<SettlementForm>(blank);
  const query = useSettlements(organizationId, property?.id || null, status, page);
  const opts = useSettlementOptions(organizationId, property?.id || null);
  const history = useSettlementHistory(organizationId, selected, historyPage);
  const save = useRecordSettlement(organizationId);
  const initial = edit?.action === "criado";
  const cash = edit && ["recebido", "repassado"].includes(edit.action);
  let preview: { commission: number; owner: number } | null = null;
  try {
    preview = commissionBreakdown(
      Number(form.gross.replace(",", ".")),
      form.commission_type,
      Number(form.commission_value.replace(",", ".")),
    );
  } catch {
    /* Campos ainda incompletos. */
  }
  function begin(action: SettlementAction, row?: SettlementRow) {
    save.reset();
    setEdit({
      settlement: row?.id || crypto.randomUUID(),
      request: crypto.randomUUID(),
      version: row?.version ?? null,
      action,
      contract: row?.contract_id || "",
      property: row?.property_id || property?.id || "",
      owner: row?.owner_client_id || "",
    });
    setForm(
      row
        ? {
            reference: row.reference,
            gross: String(row.gross).replace(".", ","),
            commission_type: row.commission_type,
            commission_value: String(row.commission_value).replace(".", ","),
            due_on: row.due_on,
            occurred_on: proposalToday(),
            note: "",
          }
        : blank(),
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!edit || save.isPending) return;
    try {
      if (!edit.contract) throw new Error("Selecione um contrato.");
      const values = settlementValues(form, edit.action, edit.owner, edit.option);
      await save.mutateAsync({ ...edit, values });
      toast.success("Registro salvo no histórico.");
      setEdit(null);
      setSelected(null);
      setPage(1);
    } catch (error) {
      toast.error(
        error instanceof Error && !("code" in error) ? error.message : settlementError(error),
      );
    }
  }
  const change = (field: keyof SettlementForm, value: string) =>
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
        onInteractOutside={(e) => {
          if (save.isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Comissões e repasses{property ? ` · ${property.code}` : ""}</DialogTitle>
          <DialogDescription>
            Controle os valores da imobiliária e do proprietário. As confirmações registram
            operações já realizadas; não fazem transferência bancária.
          </DialogDescription>
        </DialogHeader>
        {edit ? (
          <form onSubmit={submit} className="space-y-4">
            <h3 className="font-semibold">{SETTLEMENT_ACTIONS[edit.action]}</h3>
            {initial && (
              <div className="space-y-1">
                <Label htmlFor="rp-contract">Contrato *</Label>
                <select
                  id="rp-contract"
                  className={selectClass}
                  required
                  disabled={save.isPending || opts.isPending || opts.isError}
                  value={edit.contract}
                  onChange={(e) => {
                    const o = opts.data?.find((v) => v.id === e.target.value);
                    setEdit(
                      (v) =>
                        v && {
                          ...v,
                          contract: o?.id || "",
                          property: o?.property_id || "",
                          owner: o?.owner_client_id || "",
                          option: o,
                        },
                    );
                    setForm((v) => ({
                      ...v,
                      gross: o ? String(o.amount).replace(".", ",") : "",
                      reference:
                        o?.purpose === "locacao" ? proposalToday().slice(0, 7) : "VENDA-001",
                    }));
                  }}
                >
                  <option value="">Selecione</option>
                  {opts.data?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.property_code} · {o.reference} ·{" "}
                      {o.contract_status === "encerrado" ? "Encerrado" : "Em acompanhamento"}
                    </option>
                  ))}
                </select>
                {opts.isPending && <p>Carregando contratos…</p>}
                {opts.isError && (
                  <Button type="button" variant="outline" onClick={() => opts.refetch()}>
                    Tentar carregar contratos novamente
                  </Button>
                )}
                {opts.isSuccess && !opts.data.length && (
                  <p className="text-sm">
                    Nenhum contrato elegível. Registre um contrato antes de criar o demonstrativo.
                  </p>
                )}
                {edit.option && (
                  <p className="text-sm">
                    Proprietário: {edit.option.owner_name}. Período:{" "}
                    {proposalDate(edit.option.starts_on)} até{" "}
                    {edit.option.ends_on
                      ? proposalDate(edit.option.ends_on)
                      : "sem término informado"}
                    .
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="rp-reference">
                {edit.option?.purpose === "locacao"
                  ? "Competência (YYYY-MM)"
                  : "Referência / competência"}{" "}
                *
              </Label>
              <Input
                id="rp-reference"
                required
                maxLength={60}
                value={form.reference}
                disabled={save.isPending || !initial}
                onChange={(e) => change("reference", e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="rp-gross">Valor bruto (R$) *</Label>
                <Input
                  id="rp-gross"
                  required
                  inputMode="decimal"
                  value={form.gross}
                  disabled={save.isPending || !initial}
                  onChange={(e) => change("gross", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rp-type">Comissão *</Label>
                <select
                  id="rp-type"
                  className={selectClass}
                  value={form.commission_type}
                  disabled={save.isPending || !initial}
                  onChange={(e) => change("commission_type", e.target.value)}
                >
                  <option value="percentual">Percentual (%)</option>
                  <option value="fixa">Valor fixo (R$)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rp-value">
                  {form.commission_type === "percentual" ? "Percentual (%)" : "Comissão (R$)"} *
                </Label>
                <Input
                  id="rp-value"
                  required
                  inputMode="decimal"
                  value={form.commission_value}
                  disabled={save.isPending || !initial}
                  onChange={(e) => change("commission_value", e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p>
                Comissão da imobiliária:{" "}
                <strong>{preview ? formatCurrency(preview.commission) : "—"}</strong>
              </p>
              <p>
                Valor do proprietário:{" "}
                <strong>{preview ? formatCurrency(preview.owner) : "—"}</strong>
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rp-due">Previsão do repasse *</Label>
              <Input
                id="rp-due"
                type="date"
                required
                min="2000-01-01"
                max="2100-12-31"
                value={form.due_on}
                disabled={save.isPending || !initial}
                onChange={(e) => change("due_on", e.target.value)}
              />
            </div>
            {cash && (
              <div className="space-y-1">
                <Label htmlFor="rp-date">
                  Data do {edit.action === "recebido" ? "recebimento" : "repasse já realizado"} *
                </Label>
                <Input
                  id="rp-date"
                  type="date"
                  required
                  min="2000-01-01"
                  max={proposalToday()}
                  value={form.occurred_on}
                  disabled={save.isPending}
                  onChange={(e) => change("occurred_on", e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="rp-note">
                {edit.action === "cancelado" ? "Motivo" : "Confirmação / referência do comprovante"}{" "}
                *
              </Label>
              <Textarea
                id="rp-note"
                required
                maxLength={4000}
                value={form.note}
                disabled={save.isPending}
                onChange={(e) => change("note", e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {initial
                ? "Confira valores e proprietário antes de registrar. Para corrigir um demonstrativo ainda previsto, cancele-o e crie outro. Não há recebimento parcial nesta etapa."
                : cash
                  ? "Confirme somente depois que a operação aconteceu. O registro será preservado no histórico."
                  : "O cancelamento está disponível somente antes do recebimento."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={save.isPending}>
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
            <h3 className="font-semibold">
              {selected.reference} · {selected.contract_reference}
            </h3>
            <p>
              {SETTLEMENT_STATUSES[selected.display_status]} · {selected.property_code}
            </p>
            <p>Proprietário: {selected.owner_name || "Cadastro indisponível"}</p>
            <div className="rounded-md border p-3">
              <p>Bruto: {formatCurrency(Number(selected.gross))}</p>
              <p>Comissão: {formatCurrency(Number(selected.commission_amount))}</p>
              <p>Proprietário: {formatCurrency(Number(selected.owner_amount))}</p>
              <p>Previsão do repasse: {proposalDate(selected.due_on)}</p>
            </div>
            {writable && (
              <div className="flex flex-wrap gap-2">
                {selected.status === "previsto" && (
                  <>
                    <Button onClick={() => begin("recebido", selected)}>
                      Confirmar recebimento
                    </Button>
                    <Button variant="outline" onClick={() => begin("cancelado", selected)}>
                      Cancelar demonstrativo
                    </Button>
                  </>
                )}
                {selected.status === "recebido" && (
                  <Button onClick={() => begin("repassado", selected)}>
                    Confirmar repasse já realizado
                  </Button>
                )}
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
                    Versão {e.version} · {SETTLEMENT_ACTIONS[e.action]}
                  </p>
                  <p className="text-sm">
                    {e.actor_name || "Usuário"} ·{" "}
                    {new Date(e.created_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </p>
                  {e.occurred_on && <p>Data da operação: {proposalDate(e.occurred_on)}</p>}
                  <p className="whitespace-pre-wrap break-words">{e.note}</p>
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
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Comissão recebida", query.data?.totals.commission_received],
                ["Repasse pendente", query.data?.totals.owner_pending],
                ["Repasse confirmado", query.data?.totals.owner_paid],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <strong>
                    {query.isPending || query.isError ? "—" : formatCurrency(Number(value || 0))}
                  </strong>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Os indicadores consideram todos os demonstrativos deste imóvel ou empresa,
              independentemente do filtro e da página.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-1">
                <Label htmlFor="rp-filter">Situação</Label>
                <select
                  id="rp-filter"
                  className={selectClass}
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Todas</option>
                  {Object.entries(SETTLEMENT_STATUSES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>
                Atualizar
              </Button>
              {writable && <Button onClick={() => begin("criado")}>Novo demonstrativo</Button>}
            </div>
            {query.isPending ? (
              <p>Carregando demonstrativos…</p>
            ) : query.isError ? (
              <div role="alert">
                <p>Não foi possível carregar os demonstrativos.</p>
                <Button variant="outline" onClick={() => query.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : !query.data?.items.length ? (
              <p>Nenhum demonstrativo nesta situação.</p>
            ) : (
              query.data.items.map((row) => (
                <article key={row.id} className="space-y-1 rounded-md border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="font-semibold">
                      {row.reference} · {row.property_code}
                    </h3>
                    <span
                      className={row.display_status === "atrasado" ? "text-destructive" : "text-sm"}
                    >
                      {SETTLEMENT_STATUSES[row.display_status]}
                    </span>
                  </div>
                  <p>
                    {row.contract_reference} · {row.owner_name}
                  </p>
                  <p className="text-sm">
                    Bruto {formatCurrency(Number(row.gross))} · Comissão{" "}
                    {formatCurrency(Number(row.commission_amount))} · Proprietário{" "}
                    {formatCurrency(Number(row.owner_amount))}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(row);
                      setHistoryPage(1);
                    }}
                  >
                    Ver demonstrativo e histórico
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
