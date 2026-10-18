import { CommercialQueueNotice } from "./commercial-panel";
import { VoiceSearch } from "./voice-search";
import type { CommercialFilters } from "@/lib/real-estate-commercial";
import { ManualAttendanceDialog } from "./manual-attendance-dialog";
import { InquiryPropertyDialog } from "./inquiry-property-dialog";
import {
  INQUIRY_ORIGINS,
  CLOSURE_REASONS,
  manualAttendanceError,
  validClosure,
} from "@/lib/real-estate-manual-attendance";
import { InquiryPreferencesDialog } from "./inquiry-preferences-dialog";
import { InquiryFollowupDialog } from "./inquiry-followup-dialog";
import { FOLLOWUP_FILTERS, followupState } from "@/lib/real-estate-followups";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace";
import {
  useInquiries,
  useManageInquiry,
  type InquiryFilters,
} from "@/hooks/use-real-estate-inquiries";
import { usePropertyOptions } from "@/hooks/use-real-estate";
import {
  INQUIRY_STATUSES,
  inquiryError,
  type Inquiry,
  type AgendaVisit,
} from "@/lib/real-estate-inquiries";
import {
  activityError,
  localVisitDate,
  toLocalVisitDate,
  VISIT_STATUSES,
} from "@/lib/real-estate-activity";
import { canWriteProperties } from "@/lib/real-estate";
const field = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const when = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
export function PropertyInquiryManager({
  onClose,
  onLocate,
  initialCommercialFilters,
}: {
  initialCommercialFilters?: CommercialFilters;
  onClose: () => void;
  onLocate: (code: string) => void;
}) {
  const { organizationId, role } = useWorkspace();
  const writable = canWriteProperties(role);
  const [filters, setFilters] = useState<InquiryFilters>({
    commercial: initialCommercialFilters,
    kind: "queue",
    followup: "",
    status: "",
    mine: false,
    search: "",
    page: 1,
  });
  const [creating, setCreating] = useState(false);
  const [attachProperty, setAttachProperty] = useState<Inquiry | null>(null);
  const [preferences, setPreferences] = useState<Inquiry | null>(null);
  const [followup, setFollowup] = useState<{
    request: Inquiry;
    mode: "set" | "contact" | "history";
  } | null>(null);
  const query = useInquiries(organizationId, filters);
  const save = useManageInquiry(organizationId);
  const options = usePropertyOptions(organizationId, true);
  const [edit, setEdit] = useState<{
    action: string;
    request?: Inquiry;
    visit?: AgendaVisit;
  } | null>(null);
  const [form, setForm] = useState({
    status: "",
    responsible_user_id: "",
    internal_note: "",
    client_id: "",
    starts_at: "",
    ends_at: "",
    outcome: "",
    next_contact_at: "",
    closure_reason: "",
    closure_note: "",
  });
  const change = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const run = async (action: string, id: string | undefined, values: Record<string, unknown>) => {
    try {
      await save.mutateAsync({ action, id, values });
      toast.success("Registro atualizado.");
      return true;
    } catch (e) {
      toast.error(manualAttendanceError(e) || inquiryError(e) || activityError(e));
      return false;
    }
  };
  function open(action: string, request?: Inquiry, visit?: AgendaVisit) {
    setForm({
      status:
        request?.status === "encerrado" ? "em_contato" : request?.status || visit?.status || "novo",
      responsible_user_id: request?.responsible_user_id || visit?.responsible_user_id || "",
      internal_note: request?.internal_note || "",
      next_contact_at: request?.next_contact_at ? toLocalVisitDate(request.next_contact_at) : "",
      closure_reason: request?.closure_reason || "",
      closure_note: request?.closure_note || "",
      client_id: "",
      starts_at: visit ? toLocalVisitDate(visit.starts_at) : "",
      ends_at: visit ? toLocalVisitDate(visit.ends_at) : "",
      outcome: visit?.outcome || "",
    });
    setEdit({ action, request, visit });
  }
  if (creating)
    return (
      <ManualAttendanceDialog
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setCreating(false);
          setFilters({
            kind: "queue",
            status: "",
            followup: "",
            mine: false,
            search: name,
            page: 1,
          });
        }}
      />
    );
  if (attachProperty)
    return (
      <InquiryPropertyDialog request={attachProperty} onClose={() => setAttachProperty(null)} />
    );
  if (preferences)
    return (
      <InquiryPreferencesDialog
        key={preferences.id}
        request={preferences}
        onClose={() => setPreferences(null)}
      />
    );
  if (followup)
    return (
      <InquiryFollowupDialog
        key={`${followup.request.id}-${followup.mode}`}
        request={followup.request}
        mode={followup.mode}
        onClose={() => setFollowup(null)}
      />
    );
  return (
    <>
      <Dialog
        open={!edit}
        onOpenChange={(open) => {
          if (!open && !save.isPending) onClose();
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Atendimento e visitas</DialogTitle>
            <DialogDescription>
              Contatos da vitrine, WhatsApp, telefone e atendimento presencial. Preferências
              recebidas não confirmam um horário. Datas exibidas em{" "}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            </DialogDescription>
          </DialogHeader>
          {filters.commercial && filters.kind === "queue" && (
            <CommercialQueueNotice
              filters={filters.commercial}
              responsibleLabel={
                options.data?.responsibles.find((r) => r.id === filters.commercial?.responsible)
                  ?.name
              }
              onClear={() => setFilters({ ...filters, commercial: undefined, page: 1 })}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {writable && <Button onClick={() => setCreating(true)}>Novo atendimento manual</Button>}
            <Button
              variant={filters.kind === "queue" ? "default" : "outline"}
              onClick={() => setFilters({ ...filters, kind: "queue", status: "", page: 1 })}
            >
              Fila de atendimento
            </Button>
            <Button
              variant={filters.kind === "agenda" ? "default" : "outline"}
              onClick={() =>
                setFilters({ ...filters, kind: "agenda", status: "agendada", page: 1 })
              }
            >
              Agenda de visitas
            </Button>
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Atualizar
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <VoiceSearch
              mode="contact"
              onApply={({ search }) => setFilters({ ...filters, search, page: 1 })}
            />
            <Input
              aria-label="Buscar atendimento"
              placeholder="Buscar nome, código ou imóvel"
              maxLength={120}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
            />
            <select
              aria-label="Situação"
              className={field}
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            >
              <option value="">Todas as situações</option>
              {Object.entries(filters.kind === "queue" ? INQUIRY_STATUSES : VISIT_STATUSES).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.mine}
                onChange={(e) => setFilters({ ...filters, mine: e.target.checked, page: 1 })}
              />
              Somente meus atendimentos
            </Label>
          </div>
          {filters.kind === "queue" && (
            <Label className="block space-y-2">
              Próximos retornos
              <select
                className={field}
                value={filters.followup}
                onChange={(e) =>
                  setFilters({ ...filters, followup: e.target.value, status: "", page: 1 })
                }
              >
                <option value="">Todos os retornos</option>
                {Object.entries(FOLLOWUP_FILTERS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Label>
          )}
          {query.isPending ? (
            <p>Carregando…</p>
          ) : query.isError ? (
            <p role="alert">
              Não foi possível carregar. Confira a ativação do atendimento e tente atualizar.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{query.data.total} registro(s)</p>
              <div className="space-y-3">
                {query.data.items.map((item) => {
                  if (filters.kind === "queue") {
                    const q = item as Inquiry;
                    return (
                      <article key={q.id} className="space-y-3 rounded-xl border p-4">
                        <div className="flex flex-wrap justify-between gap-2">
                          <h3 className="font-semibold">
                            {q.name} · {q.property_code || "Sem imóvel definido"}
                          </h3>
                          <span className="text-sm">{INQUIRY_STATUSES[q.status]}</span>
                        </div>
                        <p className="text-sm">
                          {q.property_title || "Busca de imóvel"} ·{" "}
                          {q.purpose === "venda" ? "Compra" : "Locação"} ·{" "}
                          {q.kind === "visita" ? "Pedido de visita" : "Informações"}
                        </p>
                        <p className="text-sm">
                          Telefone informado:{" "}
                          <a
                            className="underline"
                            href={`https://wa.me/${q.phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {q.phone}
                          </a>{" "}
                          · Recebido: {when(q.created_at)}
                        </p>
                        <p className="text-sm">Origem: {INQUIRY_ORIGINS[q.origin || "vitrine"]}</p>
                        {q.closure_reason && (
                          <p className="text-sm">
                            Encerramento: {CLOSURE_REASONS[q.closure_reason]}
                            {q.closure_note && ` · ${q.closure_note}`}
                          </p>
                        )}
                        <p className="text-sm">
                          Responsável: {q.responsible_name || "Sem responsável"}
                        </p>
                        {(q.preferred_day || q.preferred_period) && (
                          <p className="text-sm">
                            Preferência: {q.preferred_day || "Dia a combinar"} ·{" "}
                            {(
                              { manha: "Manhã", tarde: "Tarde", noite: "Noite" } as Record<
                                string,
                                string
                              >
                            )[q.preferred_period || ""] || "Período a combinar"}
                          </p>
                        )}
                        {q.message && (
                          <p className="whitespace-pre-wrap text-sm">Mensagem: {q.message}</p>
                        )}
                        {q.internal_note && (
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            Nota interna: {q.internal_note}
                          </p>
                        )}
                        {q.status !== "encerrado" && (
                          <p
                            className={`text-sm ${followupState(q.next_contact_at) === "overdue" ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                          >
                            {q.next_contact_at
                              ? `${FOLLOWUP_FILTERS[followupState(q.next_contact_at) as keyof typeof FOLLOWUP_FILTERS]}: ${when(q.next_contact_at)}`
                              : "Sem próximo retorno definido"}
                          </p>
                        )}
                        {q.last_contact_at && (
                          <p className="text-sm text-muted-foreground">
                            Última conversa registrada: {when(q.last_contact_at)}
                          </p>
                        )}
                        {q.client_name && (
                          <p className="text-sm">Cliente vinculado: {q.client_name}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => setPreferences(q)}>
                            Preferências e imóveis compatíveis
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFollowup({ request: q, mode: "history" })}
                          >
                            Histórico do cliente
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={`https://wa.me/${q.phone}?text=${encodeURIComponent(`Olá! Recebemos seu interesse ${q.property_code ? `no imóvel ${q.property_code}` : "em encontrar um imóvel"}. Podemos conversar?`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Abrir WhatsApp
                            </a>
                          </Button>
                          {writable && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setFollowup({ request: q, mode: "contact" })}
                              >
                                Registrar conversa
                              </Button>
                              {q.status !== "encerrado" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setFollowup({ request: q, mode: "set" })}
                                >
                                  Próximo retorno
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => open("update", q)}>
                                {q.status === "encerrado"
                                  ? "Reabrir atendimento"
                                  : "Atender / atribuir / encerrar"}
                              </Button>
                              {!q.property_id && q.status !== "encerrado" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setAttachProperty(q)}
                                >
                                  Vincular imóvel
                                </Button>
                              )}
                              {q.property_id && !q.interest_id && q.status !== "encerrado" && (
                                <Button size="sm" variant="outline" onClick={() => open("link", q)}>
                                  Vincular cliente
                                </Button>
                              )}
                              {q.interest_id && !q.visit_id && q.status !== "encerrado" && (
                                <Button size="sm" onClick={() => open("schedule", q)}>
                                  Agendar visita
                                </Button>
                              )}
                            </>
                          )}
                          {q.visit_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setFilters({
                                  ...filters,
                                  kind: "agenda",
                                  status: "",
                                  search: q.property_code || "",
                                  page: 1,
                                })
                              }
                            >
                              Abrir agenda
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!q.property_code}
                            onClick={() => {
                              if (q.property_code) onLocate(q.property_code);
                            }}
                          >
                            Localizar imóvel / proposta
                          </Button>
                        </div>
                      </article>
                    );
                  }
                  const v = item as AgendaVisit;
                  return (
                    <article key={v.id} className="space-y-3 rounded-xl border p-4">
                      <h3 className="font-semibold">
                        {v.property_code} · {v.client_name}
                      </h3>
                      <p className="text-sm">
                        {v.property_title} · {VISIT_STATUSES[v.status]}
                      </p>
                      <p className="text-sm">
                        {when(v.starts_at)} → {when(v.ends_at)}
                      </p>
                      <p className="text-sm">
                        Corretor/responsável: {v.responsible_name || "Responsável"}
                      </p>
                      {v.status === "agendada" && (
                        <p className="text-sm">
                          {v.confirmed_at
                            ? `Confirmação do cliente registrada em ${when(v.confirmed_at)}`
                            : "Aguardando registro da confirmação do cliente"}
                        </p>
                      )}
                      {v.outcome && (
                        <p className="whitespace-pre-wrap text-sm">Resultado: {v.outcome}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {writable && (
                          <>
                            {v.status === "agendada" && !v.confirmed_at && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={save.isPending || new Date(v.starts_at) <= new Date()}
                                onClick={() =>
                                  void run("confirm", undefined, {
                                    visit_id: v.id,
                                    visit_version: v.version,
                                  })
                                }
                              >
                                Registrar confirmação do cliente
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => open("visit_result", undefined, v)}
                            >
                              Reagendar / registrar resultado
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onLocate(v.property_code)}
                        >
                          Localizar imóvel / proposta
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!query.data.items.length && <p>Nenhum registro neste filtro.</p>}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  disabled={filters.page === 1 || query.isFetching}
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                >
                  Anterior
                </Button>
                <span>Página {filters.page}</span>
                <Button
                  variant="outline"
                  disabled={filters.page * 20 >= query.data.total || query.isFetching}
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(edit)}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setEdit(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {
                (
                  {
                    update: "Atender e atribuir",
                    link: "Vincular a cliente existente",
                    schedule: "Agendar visita",
                    visit_result: "Atualizar visita",
                  } as Record<string, string>
                )[edit?.action || ""]
              }
            </DialogTitle>
            <DialogDescription>
              {edit?.request?.name || edit?.visit?.client_name}. Confirme os dados com o cliente
              antes de alterar.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (save.isPending) return;
                try {
                  const values: Record<string, unknown> = {
                    ...form,
                    version: edit.request?.version,
                    visit_id: edit.visit?.id,
                    visit_version: edit.visit?.version,
                  };
                  if (edit.action === "update") {
                    if (
                      form.status === "encerrado" &&
                      !validClosure(form.closure_reason, form.closure_note)
                    )
                      throw new Error("Escolha e detalhe o motivo do encerramento.");
                    values.next_contact_at =
                      form.status === "encerrado" || !form.next_contact_at
                        ? null
                        : edit.request?.next_contact_at &&
                            form.next_contact_at === toLocalVisitDate(edit.request.next_contact_at)
                          ? edit.request.next_contact_at
                          : localVisitDate(form.next_contact_at);
                  }
                  if (edit.action === "schedule" || edit.action === "visit_result") {
                    values.starts_at = localVisitDate(form.starts_at);
                    values.ends_at = localVisitDate(form.ends_at);
                  }
                  if (await run(edit.action, edit.request?.id, values)) setEdit(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Confira os dados.");
                }
              }}
            >
              {edit.action === "link" ? (
                <>
                  <p className="text-sm">
                    Use o cliente já cadastrado para evitar duplicidade. Se for um contato novo,
                    cadastre-o primeiro em Clientes e volte a esta fila.
                  </p>
                  <Label className="block space-y-2">
                    Cliente
                    <select
                      required
                      className={field}
                      value={form.client_id}
                      onChange={(e) => change("client_id", e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {options.data?.owners.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Label>
                </>
              ) : (
                <>
                  <Label className="block space-y-2">
                    Responsável
                    <select
                      required={edit.action !== "update"}
                      className={field}
                      value={form.responsible_user_id}
                      onChange={(e) => change("responsible_user_id", e.target.value)}
                    >
                      <option value="">Sem responsável</option>
                      {options.data?.responsibles.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </Label>
                  {edit.action === "update" ? (
                    <>
                      <Label className="block space-y-2">
                        Situação
                        <select
                          className={field}
                          value={form.status}
                          onChange={(e) => change("status", e.target.value)}
                        >
                          {Object.entries(INQUIRY_STATUSES)
                            .filter(
                              ([value]) =>
                                edit.request?.status !== "encerrado" || value !== "encerrado",
                            )
                            .map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                        </select>
                      </Label>
                      {form.status === "encerrado" ? (
                        <>
                          <Label className="block space-y-2">
                            Motivo do encerramento
                            <select
                              required
                              className={field}
                              value={form.closure_reason}
                              onChange={(e) => change("closure_reason", e.target.value)}
                            >
                              <option value="">Selecione</option>
                              {Object.entries(CLOSURE_REASONS).map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </Label>
                          <Label className="block space-y-2">
                            Detalhes do encerramento
                            <textarea
                              required={form.closure_reason === "outro"}
                              maxLength={1500}
                              className="w-full rounded-md border bg-background p-3"
                              value={form.closure_note}
                              onChange={(e) => change("closure_note", e.target.value)}
                            />
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            O próximo retorno será removido. Visitas e contratos mantêm suas
                            próprias situações.
                          </p>
                        </>
                      ) : (
                        <Label className="block space-y-2">
                          Próximo retorno
                          <Input
                            type="datetime-local"
                            value={form.next_contact_at}
                            onChange={(e) => change("next_contact_at", e.target.value)}
                          />
                        </Label>
                      )}
                      <Label className="block space-y-2">
                        Nota interna
                        <textarea
                          className="w-full rounded-md border bg-background p-3"
                          maxLength={2000}
                          value={form.internal_note}
                          onChange={(e) => change("internal_note", e.target.value)}
                        />
                      </Label>
                    </>
                  ) : (
                    <>
                      <Label className="block space-y-2">
                        Início
                        <Input
                          required
                          type="datetime-local"
                          value={form.starts_at}
                          onChange={(e) => change("starts_at", e.target.value)}
                        />
                      </Label>
                      <Label className="block space-y-2">
                        Término
                        <Input
                          required
                          type="datetime-local"
                          value={form.ends_at}
                          onChange={(e) => change("ends_at", e.target.value)}
                        />
                      </Label>
                      {edit.action === "visit_result" && (
                        <>
                          <Label className="block space-y-2">
                            Situação
                            <select
                              className={field}
                              value={form.status}
                              onChange={(e) => change("status", e.target.value)}
                            >
                              {Object.entries(VISIT_STATUSES).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </Label>
                          <Label className="block space-y-2">
                            Resultado / motivo
                            <textarea
                              required={form.status !== "agendada"}
                              maxLength={4000}
                              className="w-full rounded-md border bg-background p-3"
                              value={form.outcome}
                              onChange={(e) => change("outcome", e.target.value)}
                            />
                          </Label>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              <Button disabled={save.isPending || options.isPending}>Salvar</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
