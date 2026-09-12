import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  FileSignature,
  Loader2,
  Pencil,
  Plus,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAsaasConnection } from "@/hooks/use-asaas";
import {
  commercialProposalUrl,
  type CommercialProposal,
  type CommercialProposalInput,
  useCancelCommercialProposal,
  useCommercialProposals,
  usePublishCommercialProposal,
  useSaveCommercialProposal,
} from "@/hooks/use-commercial-proposals";

type Row = Record<string, any>;
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const isoDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const emptyProposal = (): CommercialProposalInput => ({
  title: "",
  serviceDescription: "",
  terms: "O serviço será iniciado após o aceite. Valores e prazos seguem esta proposta.",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  customerDocument: "",
  amount: 0,
  billingFrequency: "once",
  firstDueDate: isoDate(3),
  validUntil: isoDate(7),
  asaasAutoCharge: false,
  opportunityId: null,
  clientId: null,
});
const statusLabel: Record<CommercialProposal["status"], string> = {
  draft: "Rascunho",
  sent: "Enviada",
  viewed: "Visualizada",
  accepted: "Aceita",
  declined: "Recusada",
  expired: "Vencida",
  cancelled: "Cancelada",
};
const frequencyLabel: Record<CommercialProposal["billing_frequency"], string> = {
  once: "Pagamento único",
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
};

export function CommercialProposalsPanel({
  organizationId,
  opportunities,
  clients,
  canEdit,
  canCancel,
}: {
  organizationId: string;
  opportunities: Row[];
  clients: Row[];
  canEdit: boolean;
  canCancel: boolean;
}) {
  const proposals = useCommercialProposals(organizationId);
  const save = useSaveCommercialProposal(organizationId);
  const publish = usePublishCommercialProposal(organizationId);
  const cancel = useCancelCommercialProposal(organizationId);
  const asaas = useAsaasConnection(organizationId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CommercialProposalInput>(emptyProposal);
  const rows = proposals.data ?? [];
  const totals = useMemo(
    () => ({
      open: rows.filter((row) => ["draft", "sent", "viewed"].includes(row.status)).length,
      accepted: rows.filter((row) => row.status === "accepted").length,
      acceptedValue: rows
        .filter((row) => row.status === "accepted")
        .reduce((sum, row) => sum + Number(row.amount), 0),
    }),
    [rows],
  );

  const edit = (proposal: CommercialProposal) => {
    setForm({
      id: proposal.id,
      opportunityId: proposal.opportunity_id,
      clientId: proposal.client_id,
      title: proposal.title,
      serviceDescription: proposal.service_description,
      terms: proposal.terms,
      customerName: proposal.customer_name,
      customerEmail: proposal.customer_email,
      customerPhone: proposal.customer_phone,
      customerDocument: proposal.customer_document,
      amount: Number(proposal.amount),
      billingFrequency: proposal.billing_frequency,
      firstDueDate: proposal.first_due_date,
      validUntil: proposal.valid_until,
      asaasAutoCharge: proposal.asaas_auto_charge,
    });
    setEditing(true);
  };
  const submit = async () => {
    try {
      await save.mutateAsync(form);
      toast.success(form.id ? "Proposta atualizada." : "Rascunho da proposta criado.");
      setForm(emptyProposal());
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a proposta.");
    }
  };
  const publishAndCopy = async (proposal: CommercialProposal) => {
    try {
      await publish.mutateAsync({ proposalId: proposal.id });
      await navigator.clipboard.writeText(commercialProposalUrl(proposal.public_token));
      toast.success("Link público criado e copiado.");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.includes("ASAAS_NOT_CONNECTED")
          ? "Conecte o Asaas antes de publicar uma proposta com cobrança automática."
          : "Não foi possível publicar a proposta.",
      );
    }
  };
  const copyLink = async (proposal: CommercialProposal) => {
    await navigator.clipboard.writeText(commercialProposalUrl(proposal.public_token));
    toast.success("Link da proposta copiado.");
  };

  return (
    <Card className="border-primary/25 bg-primary/[0.02]">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="size-4 text-primary" /> Propostas comerciais
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Envie um link de aceite e transforme a venda em cliente, receita e cobrança.
            </p>
          </div>
          {canEdit && (
            <Button
              onClick={() => {
                setForm(emptyProposal());
                setEditing((value) => !value);
              }}
            >
              <Plus /> Nova proposta
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <ProposalMetric label="Em andamento" value={String(totals.open)} />
          <ProposalMetric label="Propostas aceitas" value={String(totals.accepted)} />
          <ProposalMetric label="Valor aceito" value={money(totals.acceptedValue)} />
        </div>

        {editing && (
          <div className="space-y-4 rounded-xl border border-primary/25 bg-background p-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-xs lg:col-span-2">
                Título da proposta
                <Input
                  value={form.title}
                  maxLength={180}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Ex.: Assessoria contábil mensal"
                />
              </label>
              <label className="grid gap-1 text-xs">
                Oportunidade
                <select
                  className={selectClass}
                  value={form.opportunityId ?? ""}
                  onChange={(event) => {
                    const opportunity = opportunities.find((row) => row.id === event.target.value);
                    setForm({
                      ...form,
                      opportunityId: event.target.value || null,
                      clientId: opportunity?.client_id ?? form.clientId,
                      title: form.title || opportunity?.title || "",
                      amount: form.amount || Number(opportunity?.estimated_value) || 0,
                    });
                  }}
                >
                  <option value="">Sem oportunidade vinculada</option>
                  {opportunities
                    .filter((row) => !["won", "lost"].includes(row.stage))
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Cliente existente
                <select
                  className={selectClass}
                  value={form.clientId ?? ""}
                  onChange={(event) => {
                    const client = clients.find((row) => row.id === event.target.value);
                    setForm({
                      ...form,
                      clientId: event.target.value || null,
                      customerName: form.customerName || client?.name || "",
                    });
                  }}
                >
                  <option value="">Criar ou localizar no aceite</option>
                  {clients.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs lg:col-span-2">
                Serviço oferecido
                <Textarea
                  rows={3}
                  maxLength={2000}
                  value={form.serviceDescription}
                  onChange={(event) => setForm({ ...form, serviceDescription: event.target.value })}
                  placeholder="Descreva claramente o que será entregue."
                />
              </label>
              <label className="grid gap-1 text-xs lg:col-span-2">
                Condições comerciais
                <Textarea
                  rows={3}
                  maxLength={4000}
                  value={form.terms}
                  onChange={(event) => setForm({ ...form, terms: event.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Nome do interessado
                <Input
                  value={form.customerName}
                  maxLength={160}
                  onChange={(event) => setForm({ ...form, customerName: event.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                E-mail
                <Input
                  type="email"
                  value={form.customerEmail ?? ""}
                  maxLength={255}
                  onChange={(event) => setForm({ ...form, customerEmail: event.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Telefone
                <Input
                  inputMode="tel"
                  value={form.customerPhone ?? ""}
                  maxLength={24}
                  onChange={(event) => setForm({ ...form, customerPhone: event.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                CPF/CNPJ {form.asaasAutoCharge ? "*" : "(opcional)"}
                <Input
                  inputMode="numeric"
                  value={form.customerDocument ?? ""}
                  maxLength={18}
                  onChange={(event) => setForm({ ...form, customerDocument: event.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Valor
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Forma de cobrança
                <select
                  className={selectClass}
                  value={form.billingFrequency}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      billingFrequency: event.target
                        .value as CommercialProposal["billing_frequency"],
                    })
                  }
                >
                  {Object.entries(frequencyLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Primeiro vencimento
                <Input
                  type="date"
                  min={isoDate(0)}
                  value={form.firstDueDate}
                  onChange={(event) => setForm({ ...form, firstDueDate: event.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Proposta válida até
                <Input
                  type="date"
                  min={isoDate(0)}
                  value={form.validUntil}
                  onChange={(event) => setForm({ ...form, validUntil: event.target.value })}
                />
              </label>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
              <Checkbox
                checked={form.asaasAutoCharge}
                disabled={asaas.data?.status !== "connected"}
                onCheckedChange={(checked) =>
                  setForm({ ...form, asaasAutoCharge: checked === true })
                }
              />
              <span>
                <strong className="block">Gerar cobrança pelo Asaas após o aceite</strong>
                <span className="text-xs text-muted-foreground">
                  {asaas.data?.status === "connected"
                    ? "O CPF/CNPJ é obrigatório. A cobrança entrará na fila automática."
                    : "Conecte o Asaas em Financeiro para habilitar esta opção."}
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button
                onClick={submit}
                disabled={
                  save.isPending ||
                  form.title.trim().length < 3 ||
                  form.serviceDescription.trim().length < 3 ||
                  form.terms.trim().length < 3 ||
                  form.customerName.trim().length < 2 ||
                  form.amount <= 0 ||
                  (form.asaasAutoCharge &&
                    ![11, 14].includes((form.customerDocument ?? "").replace(/\D/g, "").length))
                }
              >
                {save.isPending && <Loader2 className="animate-spin" />} Salvar rascunho
              </Button>
            </div>
          </div>
        )}

        {proposals.isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Carregando propostas…
          </div>
        ) : !rows.length ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma proposta criada. Use “Nova proposta” para iniciar uma venda.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((proposal) => (
              <div
                key={proposal.id}
                className="flex flex-col gap-3 rounded-xl border bg-background p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate">{proposal.title}</strong>
                    <Badge variant={proposal.status === "accepted" ? "default" : "secondary"}>
                      {statusLabel[proposal.status]}
                    </Badge>
                    {proposal.asaas_auto_charge && (
                      <Badge variant="outline">Asaas automático</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {proposal.proposal_number} · {proposal.customer_name} ·{" "}
                    {money(Number(proposal.amount))} · {frequencyLabel[proposal.billing_frequency]}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" /> Válida até{" "}
                    {new Date(`${proposal.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {proposal.status === "draft" && canEdit && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => edit(proposal)}>
                        <Pencil /> Editar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => publishAndCopy(proposal)}
                        disabled={publish.isPending}
                      >
                        <Send /> Gerar link
                      </Button>
                    </>
                  )}
                  {["sent", "viewed"].includes(proposal.status) && (
                    <Button size="sm" variant="outline" onClick={() => copyLink(proposal)}>
                      <Copy /> Copiar link
                    </Button>
                  )}
                  {proposal.status === "accepted" && (
                    <span className="flex items-center gap-1 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="size-4" /> Conversão concluída
                    </span>
                  )}
                  {canCancel && ["draft", "sent", "viewed"].includes(proposal.status) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={cancel.isPending}
                      onClick={async () => {
                        try {
                          await cancel.mutateAsync(proposal.id);
                          toast.success("Proposta cancelada.");
                        } catch {
                          toast.error("Não foi possível cancelar a proposta.");
                        }
                      }}
                    >
                      <XCircle /> Cancelar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProposalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
